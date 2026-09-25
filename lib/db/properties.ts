import { getDb } from "../db";

export type PropertyType = "primary" | "rental" | "vacation" | "other";

export interface Property {
  id: number;
  name: string;
  address: string | null;
  property_type: PropertyType;
  monthly_rental_income: number | null;
  created_at: string;
}

export interface PropertyMortgage {
  id: number;
  property_id: number;
  outstanding_amount: number;
  date_opened: string;
  rate: number;
  amortization_years: number;
  calculated_payment: number | null;
  payment_override: number | null;
  updated_at: string;
}

export interface PropertyExpense {
  id: number;
  property_id: number;
  label: string;
  monthly_amount: number;
}

export interface PropertyValueEntry {
  id: number;
  property_id: number;
  value: number;
  effective_date: string;
}

export interface PropertySummary extends Property {
  mortgage: PropertyMortgage | null;
  expenses: PropertyExpense[];
  valueHistory: PropertyValueEntry[];
  currentValue: number; // 0 when no value entered yet
  outstandingAmount: number; // 0 when no mortgage
  netValue: number;
  effectivePayment: number; // payment_override ?? calculated_payment, 0 when no mortgage
  totalExpenses: number;
  rentalIncome: number | null; // null unless property_type === 'rental'
  netIncome: number | null; // null unless property_type === 'rental'
}

const RATE_MIN = 0;
const RATE_MAX = 25;
const AMORTIZATION_MIN_YEARS = 1;
const AMORTIZATION_MAX_YEARS = 40;

export function validateMortgageInput(rate: number, amortizationYears: number): string | null {
  if (!Number.isFinite(rate) || rate < RATE_MIN || rate > RATE_MAX) {
    return `rate must be between ${RATE_MIN} and ${RATE_MAX}`;
  }
  if (
    !Number.isInteger(amortizationYears) ||
    amortizationYears < AMORTIZATION_MIN_YEARS ||
    amortizationYears > AMORTIZATION_MAX_YEARS
  ) {
    return `amortization_years must be an integer between ${AMORTIZATION_MIN_YEARS} and ${AMORTIZATION_MAX_YEARS}`;
  }
  return null;
}

// Standard amortization formula: M = P*r(1+r)^n / [(1+r)^n - 1], r = monthly
// rate, n = total number of monthly payments. Straight-line at r = 0 (the
// formula divides by zero there).
export function calculateMortgagePayment(
  outstanding: number,
  ratePct: number,
  amortizationYears: number
): number {
  const n = amortizationYears * 12;
  if (ratePct === 0) return outstanding / n;
  const r = ratePct / 100 / 12;
  const factor = Math.pow(1 + r, n);
  return (outstanding * r * factor) / (factor - 1);
}

export function listProperties(): Property[] {
  const db = getDb();
  return db.prepare("SELECT * FROM properties ORDER BY created_at DESC").all() as Property[];
}

export function getProperty(id: number): Property | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM properties WHERE id = ?").get(id) as Property) ?? null;
}

export function addProperty(input: {
  name: string;
  address?: string | null;
  property_type: PropertyType;
  monthly_rental_income?: number | null;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO properties (name, address, property_type, monthly_rental_income)
       VALUES (@name, @address, @property_type, @monthly_rental_income)`
    )
    .run({
      address: null,
      monthly_rental_income: null,
      ...input,
    });
  return Number(result.lastInsertRowid);
}

export function updateProperty(
  id: number,
  input: {
    name: string;
    address?: string | null;
    property_type: PropertyType;
    // Deliberately NOT clearing monthly_rental_income on a type change away
    // from 'rental' — the figure is kept and just stops being surfaced in
    // the summary (see getPropertySummary), so switching back to 'rental'
    // later needs no re-entry.
    monthly_rental_income?: number | null;
  }
): void {
  const db = getDb();
  db.prepare(
    `UPDATE properties
     SET name = @name, address = @address, property_type = @property_type,
         monthly_rental_income = @monthly_rental_income
     WHERE id = @id`
  ).run({ address: null, monthly_rental_income: null, ...input, id });
}

export function deleteProperty(id: number): void {
  const db = getDb();
  const del = db.transaction(() => {
    db.prepare("DELETE FROM property_value_history WHERE property_id = ?").run(id);
    db.prepare("DELETE FROM property_expenses WHERE property_id = ?").run(id);
    db.prepare("DELETE FROM property_mortgages WHERE property_id = ?").run(id);
    db.prepare("DELETE FROM properties WHERE id = ?").run(id);
  });
  del();
}

export function getMortgage(propertyId: number): PropertyMortgage | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM property_mortgages WHERE property_id = ?")
      .get(propertyId) as PropertyMortgage) ?? null
  );
}

// Upsert — one mortgage row per property. Recomputes calculated_payment on
// every write; payment_override is left untouched unless the caller passes
// it (undefined = keep existing).
export function setMortgage(
  propertyId: number,
  input: {
    outstanding_amount: number;
    date_opened: string;
    rate: number;
    amortization_years: number;
    payment_override?: number | null;
  }
): PropertyMortgage {
  // Enforced HERE, not just in the API route, so any caller (a future MCP
  // tool, a script, a direct repo call) gets the same guardrail — the route's
  // check is UX (a fast 400), this one is the actual contract.
  const validationError = validateMortgageInput(input.rate, input.amortization_years);
  if (validationError) throw new Error(validationError);

  const db = getDb();
  const calculated = calculateMortgagePayment(
    input.outstanding_amount,
    input.rate,
    input.amortization_years
  );
  const existing = getMortgage(propertyId);
  const paymentOverride =
    input.payment_override !== undefined ? input.payment_override : existing?.payment_override ?? null;

  db.prepare(
    `INSERT INTO property_mortgages
       (property_id, outstanding_amount, date_opened, rate, amortization_years, calculated_payment, payment_override, updated_at)
     VALUES (@property_id, @outstanding_amount, @date_opened, @rate, @amortization_years, @calculated_payment, @payment_override, datetime('now'))
     ON CONFLICT(property_id) DO UPDATE SET
       outstanding_amount = excluded.outstanding_amount,
       date_opened = excluded.date_opened,
       rate = excluded.rate,
       amortization_years = excluded.amortization_years,
       calculated_payment = excluded.calculated_payment,
       payment_override = excluded.payment_override,
       updated_at = datetime('now')`
  ).run({
    property_id: propertyId,
    outstanding_amount: input.outstanding_amount,
    date_opened: input.date_opened,
    rate: input.rate,
    amortization_years: input.amortization_years,
    calculated_payment: calculated,
    payment_override: paymentOverride,
  });

  return getMortgage(propertyId) as PropertyMortgage;
}

export function deleteMortgage(propertyId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM property_mortgages WHERE property_id = ?").run(propertyId);
}

export function listExpenses(propertyId: number): PropertyExpense[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM property_expenses WHERE property_id = ? ORDER BY id")
    .all(propertyId) as PropertyExpense[];
}

export function addExpense(
  propertyId: number,
  input: { label: string; monthly_amount: number }
): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO property_expenses (property_id, label, monthly_amount)
       VALUES (@property_id, @label, @monthly_amount)`
    )
    .run({ property_id: propertyId, ...input });
  return Number(result.lastInsertRowid);
}

// property_id is part of the WHERE clause, not just a response-refetch hint —
// a mismatched (propertyId, id) pair must fail loudly rather than silently
// mutating (or no-op-ing on) a row that belongs to a different property.
export function updateExpense(
  propertyId: number,
  id: number,
  input: { label: string; monthly_amount: number }
): void {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE property_expenses SET label = @label, monthly_amount = @monthly_amount WHERE id = @id AND property_id = @property_id"
    )
    .run({ ...input, id, property_id: propertyId });
  if (result.changes === 0) {
    throw new Error(`Expense ${id} not found for property ${propertyId}`);
  }
}

export function deleteExpense(propertyId: number, id: number): void {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM property_expenses WHERE id = ? AND property_id = ?")
    .run(id, propertyId);
  if (result.changes === 0) {
    throw new Error(`Expense ${id} not found for property ${propertyId}`);
  }
}

export function listValueHistory(propertyId: number): PropertyValueEntry[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM property_value_history WHERE property_id = ? ORDER BY effective_date DESC, id DESC"
    )
    .all(propertyId) as PropertyValueEntry[];
}

export function addValueEntry(
  propertyId: number,
  input: { value: number; effective_date: string }
): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO property_value_history (property_id, value, effective_date)
       VALUES (@property_id, @value, @effective_date)`
    )
    .run({ property_id: propertyId, ...input });
  return Number(result.lastInsertRowid);
}

export function deleteValueEntry(propertyId: number, id: number): void {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM property_value_history WHERE id = ? AND property_id = ?")
    .run(id, propertyId);
  if (result.changes === 0) {
    throw new Error(`Value entry ${id} not found for property ${propertyId}`);
  }
}

export function getPropertySummary(propertyId: number): PropertySummary | null {
  const property = getProperty(propertyId);
  if (!property) return null;

  const mortgage = getMortgage(propertyId);
  const expenses = listExpenses(propertyId);
  const valueHistory = listValueHistory(propertyId);
  // listValueHistory is already ordered newest-first; no value entered yet
  // -> 0 (not an empty-state prompt): a new property with a mortgage and no
  // value will show a negative net value until the user adds one.
  // Deliberate product decision, not a bug.
  const currentValue = valueHistory[0]?.value ?? 0;
  const outstandingAmount = mortgage?.outstanding_amount ?? 0;
  const effectivePayment = mortgage
    ? mortgage.payment_override ?? mortgage.calculated_payment ?? 0
    : 0;
  const totalExpenses = expenses.reduce((sum, e) => sum + e.monthly_amount, 0);
  const isRental = property.property_type === "rental";
  const rentalIncome = isRental ? property.monthly_rental_income ?? 0 : null;

  return {
    ...property,
    mortgage,
    expenses,
    valueHistory,
    currentValue,
    outstandingAmount,
    netValue: currentValue - outstandingAmount,
    effectivePayment,
    totalExpenses,
    rentalIncome,
    netIncome: isRental ? (rentalIncome ?? 0) - (effectivePayment + totalExpenses) : null,
  };
}

export function listPropertiesWithSummary(): PropertySummary[] {
  return listProperties().map((p) => getPropertySummary(p.id) as PropertySummary);
}
