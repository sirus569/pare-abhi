import { test, before } from "node:test";
import assert from "node:assert/strict";
import { SqliteRepo } from "./sqlite-repo";
import { DoBackend, MemoryDurableStore } from "./do-backend";
import { rentalNetIncomeInsights } from "../db/insights";
import type { PropertySummary } from "../db/properties";

// Phase 4 — the one surviving Insights item: flag a rental property whose
// netIncome (Phase 1's own number, rentalIncome − mortgage − expenses) is
// negative. Pure filter over PropertySummary, no new calculation. Covers the
// two things that would have shipped wrong without a close review:
// - the early-return guard in getInsights() (this insight has no dependency
//   on v_transactions at all, so it must survive a repo with zero statements)
// - an unset monthly_rental_income must NOT read as a $0 rent and flag a
//   fake loss (getPropertySummary's `?? 0` default is correct for a quiet
//   number on a card, wrong once it becomes a visible warn insight)

const backend = new DoBackend(new MemoryDurableStore());
const repo = new SqliteRepo(backend);

before(async () => {
  await backend.open();
});

// --- Pure function unit tests (no DB) ---------------------------------

function fixtureProperty(overrides: Partial<PropertySummary> = {}): PropertySummary {
  return {
    id: 1,
    name: "123 Main St",
    address: null,
    property_type: "rental",
    monthly_rental_income: 2000,
    created_at: "2024-01-01",
    mortgage: null,
    expenses: [],
    valueHistory: [],
    currentValue: 0,
    outstandingAmount: 0,
    netValue: 0,
    effectivePayment: 0,
    totalExpenses: 0,
    rentalIncome: 2000,
    netIncome: 2000,
    ...overrides,
  };
}

test("rentalNetIncomeInsights: flags a rental with negative netIncome", () => {
  const insights = rentalNetIncomeInsights([
    fixtureProperty({
      name: "Rental Unit",
      monthly_rental_income: 1500,
      rentalIncome: 1500,
      effectivePayment: 1600,
      totalExpenses: 300,
      netIncome: 1500 - (1600 + 300),
    }),
  ]);
  assert.equal(insights.length, 1);
  assert.equal(insights[0].severity, "warn");
  assert.match(insights[0].title, /Rental Unit/);
  assert.match(insights[0].detail, /\$1,500/); // rent figure surfaced
});

test("rentalNetIncomeInsights: a profitable rental produces no insight (no 'good' counterpart)", () => {
  const insights = rentalNetIncomeInsights([
    fixtureProperty({ netIncome: 500, monthly_rental_income: 2000 }),
  ]);
  assert.equal(insights.length, 0);
});

test("rentalNetIncomeInsights: a non-rental property is never evaluated regardless of its numbers", () => {
  const insights = rentalNetIncomeInsights([
    fixtureProperty({
      property_type: "primary",
      netIncome: null,
      monthly_rental_income: null,
      rentalIncome: null,
    }),
  ]);
  assert.equal(insights.length, 0);
});

test("rentalNetIncomeInsights: unset monthly_rental_income is skipped, not treated as $0 rent", () => {
  // Mortgage + expenses entered, rent field still blank — the naive
  // getPropertySummary math would read this as netIncome = 0 - 1900 =
  // sharply negative. Must NOT flag: incomplete setup, not an actual loss.
  const insights = rentalNetIncomeInsights([
    fixtureProperty({
      monthly_rental_income: null,
      rentalIncome: 0, // what getPropertySummary would compute
      effectivePayment: 1600,
      totalExpenses: 300,
      netIncome: -1900,
    }),
  ]);
  assert.equal(insights.length, 0, "an unset rent figure must not be treated as $0 and flagged");
});

test("rentalNetIncomeInsights: rent explicitly set to $0 (e.g. a vacant unit) IS evaluated", () => {
  const insights = rentalNetIncomeInsights([
    fixtureProperty({
      monthly_rental_income: 0,
      rentalIncome: 0,
      effectivePayment: 1600,
      totalExpenses: 300,
      netIncome: -1900,
    }),
  ]);
  assert.equal(insights.length, 1, "explicit $0 rent is a real input, not missing data");
});

test("rentalNetIncomeInsights: multiple losing rentals each get their own separate insight", () => {
  const insights = rentalNetIncomeInsights([
    fixtureProperty({ id: 1, name: "Rental A", netIncome: -100 }),
    fixtureProperty({ id: 2, name: "Rental B", netIncome: -200 }),
  ]);
  assert.equal(insights.length, 2);
  const titles = insights.map((i) => i.title).sort();
  assert.match(titles[0], /Rental A/);
  assert.match(titles[1], /Rental B/);
});

// --- Integration tests over getInsights() (via the repo, DoBackend) ----

test("REGRESSION: a losing rental still flags with ZERO transactions or statements uploaded", async () => {
  const id = await repo.properties.create({
    name: "No Bank Data Rental",
    property_type: "rental",
    monthly_rental_income: 1000,
  });
  await repo.properties.setMortgage(id, {
    outstanding_amount: 300000,
    date_opened: "2024-01-01",
    rate: 5,
    amortization_years: 25,
  });

  const insights = await repo.insights.get();
  assert.ok(
    insights.some((i) => i.title.includes("No Bank Data Rental")),
    "the property insight must survive getInsights()'s early-return guard even with no transaction data at all"
  );
});

test("a rental with a blank rent field produces no insight through the full repo path either", async () => {
  const id = await repo.properties.create({
    name: "Unset Rent Rental",
    property_type: "rental",
    // monthly_rental_income omitted -- stays null
  });
  await repo.properties.setMortgage(id, {
    outstanding_amount: 200000,
    date_opened: "2024-01-01",
    rate: 5,
    amortization_years: 25,
  });
  await repo.properties.addExpense(id, { label: "Property tax", monthly_amount: 200 });

  const insights = await repo.insights.get();
  assert.ok(
    !insights.some((i) => i.title.includes("Unset Rent Rental")),
    "an unset rent figure must not be flagged as a loss"
  );
});
