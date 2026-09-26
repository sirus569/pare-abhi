import { test, before } from "node:test";
import assert from "node:assert/strict";
import { SqliteRepo } from "./sqlite-repo";
import { DoBackend, MemoryDurableStore } from "./do-backend";
import type { NewTransaction } from "./types";

// The /transactions flow tabs: SPEND / INCOME / TRANSFERS ("transfer,payment")
// / ALL. The list filter takes one flow or a comma-separated set. Runs over the
// in-memory DoBackend (the hosted path; self-host shares listTransactions).

const backend = new DoBackend(new MemoryDurableStore());
const repo = new SqliteRepo(backend);

const row = (flow: NewTransaction["flow"], n: number): NewTransaction => ({
  statement_id: null,
  source: "test_chequing",
  account: "test",
  period: "2026-06",
  txn_date: `2026-06-${String(n).padStart(2, "0")}`,
  description: `ROW ${flow}`,
  amount: 10 + n,
  category: "Banking",
  flow,
  dedup_key: `flow-${flow}-${n}`,
  account_kind: "chequing",
});

before(async () => {
  await backend.open();
  await repo.categories.seed();
  await repo.transactions.insertMany([
    row("spend", 1),
    row("income", 2),
    row("transfer", 3),
    row("payment", 4),
    row("fee_interest", 5),
  ]);
});

const flowsOf = async (flow?: string) =>
  (await repo.transactions.list({ flow, limit: 50 })).rows.map((r) => r.flow).sort();

test("single flow filter", async () => {
  assert.deepEqual(await flowsOf("income"), ["income"]);
});

test("comma-separated flows (the TRANSFERS tab)", async () => {
  assert.deepEqual(await flowsOf("transfer,payment"), ["payment", "transfer"]);
  assert.deepEqual(await flowsOf(" transfer , payment ,"), ["payment", "transfer"], "tolerates spaces/blanks");
});

test("no flow filter returns everything, and rows carry account_kind", async () => {
  assert.equal((await flowsOf()).length, 5);
  const { rows } = await repo.transactions.list({ limit: 1 });
  assert.equal((rows[0] as unknown as { account_kind: string }).account_kind, "chequing");
});
