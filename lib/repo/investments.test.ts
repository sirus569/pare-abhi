import { test, before } from "node:test";
import assert from "node:assert/strict";
import { SqliteRepo } from "./sqlite-repo";
import { DoBackend, MemoryDurableStore } from "./do-backend";
import { investmentNetWorthObservations } from "../db/networth";
import type { InvestmentAccountSummary } from "../db/investments";

// Investment accounts (migration 016): CRUD, the one-balance-per-date upsert,
// and the Net Worth fold-in — id-keyed timelines (the manual_entries typo
// problem this domain exists to fix) and closed accounts stopping their carry-
// forward. Runs over DoBackend (the hosted-path harness), like properties.test.ts.

const backend = new DoBackend(new MemoryDurableStore());
const repo = new SqliteRepo(backend);

before(async () => {
  await backend.open();
});

// --- Pure function ------------------------------------------------------

function fixture(overrides: Partial<InvestmentAccountSummary> = {}): InvestmentAccountSummary {
  return {
    id: 7,
    name: "Work 401k",
    account_type: "401k",
    institution: null,
    note: null,
    closed: false,
    created_at: "2025-01-01",
    history: [],
    currentBalance: null,
    asOf: null,
    change: null,
    ...overrides,
  };
}

test("investmentNetWorthObservations: keyed by id, never by name", () => {
  const obs = investmentNetWorthObservations([
    fixture({ id: 1, name: "IRA", history: [{ id: 1, account_id: 1, balance: 100, as_of_date: "2025-01-01" }] }),
    fixture({ id: 2, name: "IRA", history: [{ id: 2, account_id: 2, balance: 200, as_of_date: "2025-01-01" }] }),
  ]);
  assert.deepEqual(
    obs.map((o) => [o.name, o.label, o.value]),
    [
      ["investment:1", "IRA", 100],
      ["investment:2", "IRA", 200],
    ]
  );
});

test("investmentNetWorthObservations: an account with no balances contributes nothing", () => {
  assert.deepEqual(investmentNetWorthObservations([fixture()]), []);
});

// --- Repo (DB-backed) ---------------------------------------------------

test("create an account: no balance yet → null current balance", async () => {
  const id = await repo.investments.create({ name: "Roth", account_type: "roth_ira", institution: "Vanguard" });
  const a = await repo.investments.get(id);
  assert.ok(a);
  assert.equal(a!.institution, "Vanguard");
  assert.equal(a!.closed, false);
  assert.equal(a!.currentBalance, null);
  assert.equal(a!.change, null);
});

test("setBalance upserts on (account, date): re-entering a date replaces it", async () => {
  const id = await repo.investments.create({ name: "Brokerage", account_type: "brokerage" });
  await repo.investments.setBalance(id, { balance: 1000, as_of_date: "2025-01-31" });
  await repo.investments.setBalance(id, { balance: 1200, as_of_date: "2025-02-28" });
  await repo.investments.setBalance(id, { balance: 1150, as_of_date: "2025-02-28" }); // typo fix

  const a = await repo.investments.get(id);
  assert.equal(a!.history.length, 2);
  assert.equal(a!.currentBalance, 1150);
  assert.equal(a!.asOf, "2025-02-28");
  assert.equal(a!.change, 150);
});

test("setBalance on a missing account throws", async () => {
  await assert.rejects(
    repo.investments.setBalance(999999, { balance: 1, as_of_date: "2025-01-01" }),
    /not found/
  );
});

test("deleteBalance is scoped to its account", async () => {
  const a = await repo.investments.create({ name: "A", account_type: "other" });
  const b = await repo.investments.create({ name: "B", account_type: "other" });
  await repo.investments.setBalance(a, { balance: 5, as_of_date: "2025-01-01" });
  const entryId = (await repo.investments.get(a))!.history[0].id;
  await assert.rejects(repo.investments.deleteBalance(b, entryId), /not found/);
  await repo.investments.deleteBalance(a, entryId);
  assert.equal((await repo.investments.get(a))!.history.length, 0);
});

test("delete removes the account and its history", async () => {
  const id = await repo.investments.create({ name: "Temp", account_type: "hsa" });
  await repo.investments.setBalance(id, { balance: 10, as_of_date: "2025-01-01" });
  await repo.investments.delete(id);
  assert.equal(await repo.investments.get(id), null);
  assert.ok(!(await repo.investments.list()).some((a) => a.id === id));
});

// --- Net Worth integration ---------------------------------------------

test("net worth: a rename keeps one timeline, and it's labelled with the new name", async () => {
  const id = await repo.investments.create({ name: "Old name", account_type: "ira" });
  await repo.investments.setBalance(id, { balance: 5000, as_of_date: "2024-03-15" });
  await repo.investments.update(id, { name: "New name", account_type: "ira" });
  await repo.investments.setBalance(id, { balance: 5500, as_of_date: "2024-04-15" });

  const nw = await repo.netWorth.get();
  const rows = nw.accounts.filter((a) => a.name === `investment:${id}`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "New name");
  assert.equal(rows[0].type, "investment");
  assert.equal(rows[0].kind, "asset");
  assert.equal(rows[0].current, 5500);
  assert.ok(!nw.accounts.some((a) => a.label === "Old name"));
});

test("net worth: a closed account stops carrying forward after its last balance", async () => {
  const oldPlan = await repo.investments.create({ name: "Old 401k", account_type: "401k" });
  const rollover = await repo.investments.create({ name: "Rollover IRA", account_type: "ira" });
  await repo.investments.setBalance(oldPlan, { balance: 20000, as_of_date: "2023-01-10" });
  await repo.investments.setBalance(rollover, { balance: 20000, as_of_date: "2023-03-10" });
  await repo.investments.setClosed(oldPlan, true);

  const nw = await repo.netWorth.get();
  const key = `investment:${oldPlan}`;
  const jan = nw.series.find((p) => p.month === "2023-01")!;
  const mar = nw.series.find((p) => p.month === "2023-03")!;
  assert.equal(jan.balances[key], 20000, "history up to the last balance is kept");
  assert.equal(mar.balances[key], undefined, "no carry-forward after close");
  assert.equal(mar.balances[`investment:${rollover}`], 20000);
  assert.equal(nw.accounts.find((a) => a.name === key)!.closed, true);

  await repo.investments.setClosed(oldPlan, false);
  const reopened = await repo.netWorth.get();
  assert.equal(reopened.series.find((p) => p.month === "2023-03")!.balances[key], 20000);
});
