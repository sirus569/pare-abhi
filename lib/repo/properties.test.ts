import { test, before } from "node:test";
import assert from "node:assert/strict";
import { SqliteRepo } from "./sqlite-repo";
import { DoBackend, MemoryDurableStore } from "./do-backend";

// Properties (migration 014): CRUD for properties/mortgages/expenses/value
// history, the amortization calc, and the resolved gaps from planning —
// missing-value defaults to $0 net value, a type change away from 'rental'
// keeps (but hides) rental income, mortgage is optional at creation. Runs
// over DoBackend (the hosted-path harness) per the same convention as
// account-meta.test.ts, so this proves hosted parity, not just self-host.

const backend = new DoBackend(new MemoryDurableStore());
const repo = new SqliteRepo(backend);

before(async () => {
  await backend.open();
});

test("create a property with no mortgage and no value: outstanding + currentValue default to 0", async () => {
  const id = await repo.properties.create({
    name: "Owned Outright",
    property_type: "primary",
  });
  const p = await repo.properties.get(id);
  assert.ok(p);
  assert.equal(p!.outstandingAmount, 0);
  assert.equal(p!.currentValue, 0);
  assert.equal(p!.netValue, 0);
  assert.equal(p!.mortgage, null);
  assert.equal(p!.netIncome, null, "non-rental never gets a net income figure");
});

test("mortgage payment is calculated and cached; payment_override wins over it", async () => {
  const id = await repo.properties.create({ name: "123 Main St", property_type: "primary" });
  await repo.properties.setMortgage(id, {
    outstanding_amount: 300000,
    date_opened: "2024-01-01",
    rate: 5,
    amortization_years: 25,
  });
  let p = await repo.properties.get(id);
  assert.ok(p!.mortgage);
  // Known-good amortization value: $300k @ 5%/25yr (300 monthly payments) ≈ $1753.77/mo.
  assert.ok(Math.abs(p!.mortgage!.calculated_payment! - 1753.77) < 1, p!.mortgage!.calculated_payment);
  assert.equal(p!.effectivePayment, p!.mortgage!.calculated_payment);

  await repo.properties.setMortgage(id, {
    outstanding_amount: 300000,
    date_opened: "2024-01-01",
    rate: 5,
    amortization_years: 25,
    payment_override: 2000,
  });
  p = await repo.properties.get(id);
  assert.equal(p!.mortgage!.payment_override, 2000);
  assert.equal(p!.effectivePayment, 2000, "override wins over the calculated payment");
});

test("rate = 0 falls back to straight-line, not a divide-by-zero", async () => {
  const id = await repo.properties.create({ name: "Zero Rate", property_type: "other" });
  await repo.properties.setMortgage(id, {
    outstanding_amount: 120000,
    date_opened: "2024-01-01",
    rate: 0,
    amortization_years: 10,
  });
  const p = await repo.properties.get(id);
  assert.ok(Number.isFinite(p!.mortgage!.calculated_payment!));
  assert.ok(Math.abs(p!.mortgage!.calculated_payment! - 1000) < 1e-6); // 120000 / 120 months
});

test("net value and net income roll up value history, mortgage, expenses, and rental income", async () => {
  const id = await repo.properties.create({
    name: "Rental Unit",
    property_type: "rental",
    monthly_rental_income: 2500,
  });
  await repo.properties.setMortgage(id, {
    outstanding_amount: 200000,
    date_opened: "2023-06-01",
    rate: 4,
    amortization_years: 25,
    payment_override: 1000, // fix the payment so the math below is exact
  });
  await repo.properties.addValueEntry(id, { value: 400000, effective_date: "2024-01-01" });
  await repo.properties.addValueEntry(id, { value: 420000, effective_date: "2024-06-01" }); // later, should win
  await repo.properties.addExpense(id, { label: "Property tax", monthly_amount: 300 });
  await repo.properties.addExpense(id, { label: "Insurance", monthly_amount: 100 });

  const p = await repo.properties.get(id);
  assert.equal(p!.currentValue, 420000, "latest by effective_date wins, not insertion order");
  assert.equal(p!.netValue, 420000 - 200000);
  assert.equal(p!.totalExpenses, 400);
  assert.equal(p!.netIncome, 2500 - (1000 + 400));
});

test("reclassifying away from rental hides net income but keeps the rental income figure", async () => {
  const id = await repo.properties.create({
    name: "Toggle Type",
    property_type: "rental",
    monthly_rental_income: 1800,
  });
  let p = await repo.properties.get(id);
  assert.equal(p!.rentalIncome, 1800);
  assert.ok(p!.netIncome !== null);

  await repo.properties.update(id, { name: "Toggle Type", property_type: "vacation" });
  p = await repo.properties.get(id);
  assert.equal(p!.netIncome, null, "no longer a rental — net income hidden");
  assert.equal(p!.rentalIncome, null, "getPropertySummary only surfaces rentalIncome for rentals");

  // Switching back to rental restores it with no re-entry — the underlying
  // column was never cleared by the type change.
  await repo.properties.update(id, {
    name: "Toggle Type",
    property_type: "rental",
    monthly_rental_income: 1800,
  });
  p = await repo.properties.get(id);
  assert.equal(p!.rentalIncome, 1800);
});

test("deleting a property removes its mortgage, expenses, and value history", async () => {
  const id = await repo.properties.create({ name: "To Delete", property_type: "other" });
  await repo.properties.setMortgage(id, {
    outstanding_amount: 50000,
    date_opened: "2024-01-01",
    rate: 3,
    amortization_years: 15,
  });
  await repo.properties.addExpense(id, { label: "Upkeep", monthly_amount: 50 });
  await repo.properties.addValueEntry(id, { value: 100000, effective_date: "2024-01-01" });

  await repo.properties.delete(id);
  assert.equal(await repo.properties.get(id), null);

  const remaining = await repo.properties.list();
  assert.ok(remaining.every((p) => p.id !== id));
});

test("expense and value-history CRUD round-trip", async () => {
  const id = await repo.properties.create({ name: "Expense Test", property_type: "primary" });
  const expenseId = await repo.properties.addExpense(id, { label: "HOA", monthly_amount: 150 });
  await repo.properties.updateExpense(id, expenseId, { label: "HOA fees", monthly_amount: 175 });
  let p = await repo.properties.get(id);
  assert.equal(p!.expenses[0].label, "HOA fees");
  assert.equal(p!.expenses[0].monthly_amount, 175);

  await repo.properties.deleteExpense(id, expenseId);
  p = await repo.properties.get(id);
  assert.equal(p!.expenses.length, 0);

  const valueId = await repo.properties.addValueEntry(id, {
    value: 500000,
    effective_date: "2024-01-01",
  });
  p = await repo.properties.get(id);
  assert.equal(p!.valueHistory.length, 1);
  await repo.properties.deleteValueEntry(id, valueId);
  p = await repo.properties.get(id);
  assert.equal(p!.valueHistory.length, 0);
  assert.equal(p!.currentValue, 0);
});

test("mutating an expense or value entry under the wrong property is rejected, not a silent no-op", async () => {
  const idA = await repo.properties.create({ name: "Property A", property_type: "primary" });
  const idB = await repo.properties.create({ name: "Property B", property_type: "primary" });
  const expenseId = await repo.properties.addExpense(idA, { label: "Insurance", monthly_amount: 80 });
  const valueId = await repo.properties.addValueEntry(idA, { value: 300000, effective_date: "2024-01-01" });

  await assert.rejects(() =>
    repo.properties.updateExpense(idB, expenseId, { label: "Hijacked", monthly_amount: 1 })
  );
  await assert.rejects(() => repo.properties.deleteExpense(idB, expenseId));
  await assert.rejects(() => repo.properties.deleteValueEntry(idB, valueId));

  // Untouched under the correct property.
  const a = await repo.properties.get(idA);
  assert.equal(a!.expenses[0].label, "Insurance");
  assert.equal(a!.valueHistory.length, 1);
});

test("setMortgage rejects an out-of-range rate or amortization even without going through the API route", async () => {
  const id = await repo.properties.create({ name: "Bad Mortgage", property_type: "primary" });
  await assert.rejects(() =>
    repo.properties.setMortgage(id, {
      outstanding_amount: 100000,
      date_opened: "2024-01-01",
      rate: -5,
      amortization_years: 25,
    })
  );
  await assert.rejects(() =>
    repo.properties.setMortgage(id, {
      outstanding_amount: 100000,
      date_opened: "2024-01-01",
      rate: 5,
      amortization_years: 200,
    })
  );
  const p = await repo.properties.get(id);
  assert.equal(p!.mortgage, null, "the invalid writes must not have partially applied");
});
