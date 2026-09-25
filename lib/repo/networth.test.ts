import { test, before } from "node:test";
import assert from "node:assert/strict";
import { SqliteRepo } from "./sqlite-repo";
import { DoBackend, MemoryDurableStore } from "./do-backend";
import { propertyNetWorthObservations } from "../db/networth";
import type { PropertySummary } from "../db/properties";

// Net worth (lib/db/networth.ts): the first dedicated test file for this
// domain (previously only incidentally covered by account-meta.test.ts's
// hidden/closed tests). Covers the Phase 2 Properties integration —
// folding property value history (asset) and mortgage (liability) into the
// same timeline model statements/manual_entries already use — plus a
// direct regression test for the mortgage-anchor bug caught on review
// before it shipped (see propertyNetWorthObservations()'s own comment).

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
    property_type: "primary",
    monthly_rental_income: null,
    created_at: "2024-01-01",
    mortgage: null,
    expenses: [],
    valueHistory: [],
    currentValue: 0,
    outstandingAmount: 0,
    netValue: 0,
    effectivePayment: 0,
    totalExpenses: 0,
    rentalIncome: null,
    netIncome: null,
    ...overrides,
  };
}

test("propertyNetWorthObservations: namespaces keys by property id, never the raw name", () => {
  const obs = propertyNetWorthObservations([
    fixtureProperty({
      id: 7,
      name: "Cottage",
      valueHistory: [{ id: 1, property_id: 7, value: 400000, effective_date: "2024-01-01" }],
      mortgage: {
        id: 1,
        property_id: 7,
        outstanding_amount: 250000,
        date_opened: "2023-06-01",
        rate: 4,
        amortization_years: 25,
        calculated_payment: 1300,
        payment_override: null,
        updated_at: "2024-03-01 00:00:00",
      },
    }),
  ]);
  assert.equal(obs.length, 2);
  const asset = obs.find((o) => o.kind === "asset")!;
  const liability = obs.find((o) => o.kind === "liability")!;
  assert.equal(asset.name, "property:7:value");
  assert.equal(asset.label, "Cottage");
  assert.equal(asset.value, 400000);
  assert.equal(liability.name, "property:7:mortgage");
  assert.equal(liability.label, "Cottage — Mortgage");
  assert.equal(liability.value, -250000, "liability must be signed negative");
  // Anchored to date_opened, NOT updated_at — the bug this function exists to avoid.
  assert.equal(liability.date, "2023-06-01");
});

test("propertyNetWorthObservations: an empty property (no value, no mortgage) contributes nothing", () => {
  const obs = propertyNetWorthObservations([fixtureProperty({ id: 9 })]);
  assert.equal(obs.length, 0);
});

test("propertyNetWorthObservations: multiple value-history rows become multiple observations", () => {
  const obs = propertyNetWorthObservations([
    fixtureProperty({
      id: 3,
      valueHistory: [
        { id: 1, property_id: 3, value: 380000, effective_date: "2023-01-01" },
        { id: 2, property_id: 3, value: 400000, effective_date: "2024-01-01" },
      ],
    }),
  ]);
  assert.equal(obs.length, 2);
  assert.ok(obs.every((o) => o.kind === "asset" && o.name === "property:3:value"));
});

// --- Integration tests over getNetWorth() (via the repo, DoBackend) ----

test("a property with value history and a mortgage produces two signed lines in net worth", async () => {
  const id = await repo.properties.create({ name: "Rental A", property_type: "rental" });
  await repo.properties.addValueEntry(id, { value: 500000, effective_date: "2023-01-01" });
  await repo.properties.setMortgage(id, {
    outstanding_amount: 300000,
    date_opened: "2022-06-01",
    rate: 4.5,
    amortization_years: 25,
  });

  const nw = await repo.netWorth.get();
  const asset = nw.accounts.find((a) => a.name === `property:${id}:value`);
  const liability = nw.accounts.find((a) => a.name === `property:${id}:mortgage`);
  assert.ok(asset, "asset line must appear");
  assert.ok(liability, "liability line must appear");
  assert.equal(asset!.type, "property");
  assert.equal(asset!.kind, "asset");
  assert.equal(asset!.current, 500000);
  assert.equal(liability!.kind, "liability");
  assert.equal(liability!.current, -300000);

  const current = nw.current!;
  assert.ok(current.assets >= 500000);
  assert.ok(current.liabilities >= 300000);
});

test("a property sharing a display name with a manual entry does not merge histories", async () => {
  await repo.netWorth.addEntry({
    name: "Shared Name",
    kind: "asset",
    amount: 10000,
    effective_date: "2024-01-01",
  });
  const propId = await repo.properties.create({ name: "Shared Name", property_type: "primary" });
  await repo.properties.addValueEntry(propId, { value: 250000, effective_date: "2024-01-01" });

  const nw = await repo.netWorth.get();
  const manualLine = nw.accounts.find((a) => a.type === "manual" && a.name === "Shared Name");
  const propertyLine = nw.accounts.find((a) => a.type === "property" && a.name === `property:${propId}:value`);
  assert.ok(manualLine, "manual entry must survive as its own line");
  assert.equal(manualLine!.current, 10000, "manual entry's value must not have merged with the property's");
  assert.ok(propertyLine, "property must survive as its own line");
  assert.equal(propertyLine!.current, 250000);
});

test("a property with neither a value nor a mortgage does not appear in net worth at all", async () => {
  const before = (await repo.netWorth.get()).accounts.length;
  const id = await repo.properties.create({ name: "Empty Property", property_type: "vacation" });
  const after = await repo.netWorth.get();
  assert.equal(after.accounts.length, before, "an empty property must add zero lines");
  assert.ok(after.accounts.every((a) => !a.name.includes(`property:${id}:`)));
});

test("net worth history before a property's first entry does not retroactively include it", async () => {
  // Pre-existing statement/manual data already spans some months; adding a
  // property with a LATER first value-history date must not backfill it
  // into months before that date (same contract manual_entries already has).
  const id = await repo.properties.create({ name: "Late Add", property_type: "primary" });
  await repo.properties.addValueEntry(id, { value: 350000, effective_date: "2025-06-01" });
  const nw = await repo.netWorth.get();
  const early = nw.series.find((p) => p.month < "2025-06");
  if (early) {
    assert.ok(!(`property:${id}:value` in early.balances), "must not appear before its first entry");
  }
});

test("REGRESSION: updating a mortgage's balance does not erase the liability from already-shown history", async () => {
  const id = await repo.properties.create({ name: "Paydown Test", property_type: "primary" });
  await repo.properties.setMortgage(id, {
    outstanding_amount: 300000,
    date_opened: "2020-01-01",
    rate: 4,
    amortization_years: 25,
  });

  const before1 = await repo.netWorth.get();
  const key = `property:${id}:mortgage`;
  const earlyMonth = before1.series.find((p) => p.month === "2021-01");
  // The liability must already be present that far back, anchored to date_opened.
  assert.ok(earlyMonth && key in earlyMonth.balances, "liability must be present as of 2021-01");
  assert.equal(earlyMonth!.balances[key], -300000);

  // Simulate a real balance update later ("paid down some principal") — the
  // bug this test exists to catch: if the liability were anchored to
  // updated_at instead of date_opened, this second write would silently
  // erase it from 2021-01 onward until "now".
  await repo.properties.setMortgage(id, {
    outstanding_amount: 280000,
    date_opened: "2020-01-01", // unchanged, as the real edit form leaves it
    rate: 4,
    amortization_years: 25,
  });

  const after = await repo.netWorth.get();
  const stillEarly = after.series.find((p) => p.month === "2021-01");
  assert.ok(stillEarly && key in stillEarly.balances, "liability must STILL be present as of 2021-01 after the edit");
  assert.equal(
    stillEarly!.balances[key],
    -280000,
    "the value updates (there's only one snapshot, no real history) but the PRESENCE since date_opened must not disappear"
  );
});
