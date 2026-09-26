import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { SqliteRepo } from "./sqlite-repo";
import { DoBackend, MemoryDurableStore } from "./do-backend";
import type { NewTransaction } from "./types";
import { suggestTypeKeyword, matchTypeRule } from "../transaction-types";

// Editable transaction types over the in-memory DoBackend (the hosted path;
// self-host runs the same lib/db code). Synthetic rows only.

const backend = new DoBackend(new MemoryDurableStore());
const repo = new SqliteRepo(backend);
let db: Database.Database;

const row = (
  key: string,
  description: string,
  flow: NewTransaction["flow"],
  account_kind = "chequing"
): NewTransaction => ({
  statement_id: null,
  source: "test_chequing",
  account: "test",
  period: "2026-06",
  txn_date: "2026-06-15",
  description,
  amount: 50,
  category: "Banking",
  flow,
  dedup_key: key,
  account_kind,
});

const byKey = (key: string) =>
  db
    .prepare(
      `SELECT t.id, t.flow, t.original_flow, t.flow_manual, v.effective_category AS category
         FROM transactions t JOIN v_transactions v ON v.id = t.id WHERE t.dedup_key = ?`
    )
    .get(key) as { id: number; flow: string; original_flow: string | null; flow_manual: number; category: string };

before(async () => {
  db = await backend.open();
  await repo.categories.seed();
  await repo.transactions.insertMany([
    row("zelle-out", "Zelle payment to SAMPLE SITTER", "transfer"),
    row("zelle-out-2", "Zelle payment to SAMPLE LANDLORD", "transfer"),
    row("zelle-in", "Zelle payment from SAMPLE FRIEND", "transfer"),
    row("coffee", "CORNER CAFE", "spend", "card"),
  ]);
});

beforeEach(async () => {
  for (const r of await repo.transactionTypes.listRules()) await repo.transactionTypes.deleteRule(r.id);
  for (const k of ["zelle-out", "zelle-out-2", "zelle-in"]) await repo.transactionTypes.reset(byKey(k).id);
});

test("suggestTypeKeyword stops at a direction word, else drops id-like tokens", () => {
  assert.equal(suggestTypeKeyword("Zelle payment to SAMPLE SITTER"), "ZELLE PAYMENT TO");
  assert.equal(suggestTypeKeyword("Zelle payment from SAMPLE FRIEND"), "ZELLE PAYMENT FROM");
  assert.equal(suggestTypeKeyword("INTERNET TRANSFER 000123"), "INTERNET TRANSFER");
  assert.equal(matchTypeRule("zelle PAYMENT to x", [{ keyword: "Zelle payment to", flow: "spend" }]), "spend");
});

test("a direction-specific rule re-types only that direction, and deleting it restores", async () => {
  const preview = await repo.transactionTypes.preview("zelle payment to");
  assert.equal(preview.count, 2, "preview counts both outgoing rows, not the incoming one");

  const { typed } = await repo.transactionTypes.addRule("Zelle payment to", "spend");
  assert.equal(typed, 2);
  assert.equal(byKey("zelle-out").flow, "spend");
  assert.equal(byKey("zelle-out").original_flow, "transfer");
  assert.equal(byKey("zelle-in").flow, "transfer", "incoming Zelle untouched");
  assert.equal(byKey("zelle-in").original_flow, null);

  const [rule] = await repo.transactionTypes.listRules();
  const del = await repo.transactionTypes.deleteRule(rule.id);
  assert.equal(del.typed, 2);
  assert.equal(byKey("zelle-out").flow, "transfer");
  assert.equal(byKey("zelle-out").original_flow, null, "back to untouched");
});

test("duplicate keywords are refused case-insensitively", async () => {
  await repo.transactionTypes.addRule("Zelle payment to", "spend");
  await assert.rejects(repo.transactionTypes.addRule("ZELLE PAYMENT TO", "income"), /already exists/);
});

test("a manual type beats rules; reset returns to the rule, then the import", async () => {
  await repo.transactionTypes.addRule("Zelle payment to", "spend");
  const id = byKey("zelle-out").id;

  assert.equal(await repo.transactionTypes.set(id, "transfer"), true);
  assert.deepEqual(await repo.transactionTypes.get(id), { flow: "transfer", original_flow: "transfer", manual: true });

  // Re-applying rules (every upload does, via recategorizeAll) keeps the pin.
  await repo.categories.recategorizeAll();
  assert.equal(byKey("zelle-out").flow, "transfer");

  await repo.transactionTypes.reset(id);
  assert.deepEqual(await repo.transactionTypes.get(id), { flow: "spend", original_flow: "transfer", manual: false });

  assert.equal(await repo.transactionTypes.set(999999, "spend"), false, "unknown row");
  assert.equal(await repo.transactionTypes.reset(999999), false);
});

test("type decides category eligibility: a transfer re-typed to spend takes merchant rules", async () => {
  // A seeded (built-in) category rule must NOT tag a deposit TRANSFER, but may
  // tag deposit SPEND — so the category follows the type change.
  // "Coffee" is a built-in category name, so it's barred from deposit transfers.
  await repo.categories.addRule("Coffee", "SAMPLE SITTER");
  await repo.categories.recategorizeAll();
  const before = byKey("zelle-out").category;

  await repo.transactionTypes.addRule("Zelle payment to", "spend");
  assert.equal(byKey("zelle-out").flow, "spend");
  assert.equal(byKey("zelle-out").category, "Coffee");
  assert.equal(before, "Banking", "while a transfer, the built-in category couldn't apply");
});

test("rows returned by list() carry the manual flag", async () => {
  const id = byKey("zelle-in").id;
  await repo.transactionTypes.set(id, "income");
  const { rows } = await repo.transactions.list({ flow: "income", limit: 10 });
  const hit = rows.find((r) => r.id === id) as unknown as { flow_manual: number } | undefined;
  assert.equal(hit?.flow_manual, 1);
});

test("type rules persist to user-type-rules.json and restore on a fresh DB", async () => {
  await repo.transactionTypes.addRule("Zelle payment to", "spend");
  const file = path.join(process.env.PARE_DATA_DIR!, "user-type-rules.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf-8")), [{ keyword: "Zelle payment to", flow: "spend" }]);

  const fresh = new SqliteRepo(new DoBackend(new MemoryDurableStore()));
  await fresh.categories.seed();
  assert.deepEqual(
    (await fresh.transactionTypes.listRules()).map((r) => [r.keyword, r.flow]),
    [["Zelle payment to", "spend"]]
  );
});
