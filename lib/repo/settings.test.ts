import { test, before } from "node:test";
import assert from "node:assert/strict";
import { SqliteRepo } from "./sqlite-repo";
import { DoBackend, MemoryDurableStore } from "./do-backend";
import type { Currency } from "../currency";
import { guessCurrency, isCurrency } from "../currency";
import { formatMoney } from "../format";

// User settings (migration 017): the single display currency. Runs over the
// in-memory DoBackend (the hosted path) — the setting must live in the user's
// own data DB so it works on both deploy targets.

const backend = new DoBackend(new MemoryDurableStore());
const repo = new SqliteRepo(backend);

before(async () => {
  await backend.open();
});

test("settings: a fresh DB defaults to CAD (existing installs predate the setting)", async () => {
  assert.deepEqual(await repo.settings.get(), { currency: "CAD" });
});

test("settings: setCurrency round-trips and is idempotent", async () => {
  await repo.settings.setCurrency("USD");
  assert.equal((await repo.settings.get()).currency, "USD");
  await repo.settings.setCurrency("USD");
  assert.equal((await repo.settings.get()).currency, "USD");
  await repo.settings.setCurrency("CAD");
  assert.equal((await repo.settings.get()).currency, "CAD");
});

test("settings: an unsupported currency is rejected, not stored", async () => {
  await assert.rejects(() => repo.settings.setCurrency("EUR" as Currency));
  assert.equal((await repo.settings.get()).currency, "CAD");
});

test("insights: getInsights reads the stored currency (no stale module state)", async () => {
  await repo.settings.setCurrency("USD");
  // No transactions: only property-derived insights can fire, and there are
  // none — this just proves getInsights reads the setting without throwing.
  assert.deepEqual(await repo.insights.get(), []);
  await repo.settings.setCurrency("CAD");
});

test("formatMoney: each currency renders a bare $ in its home locale", () => {
  assert.equal(formatMoney(1234.5, "CAD"), "$1,235");
  assert.equal(formatMoney(1234.5, "USD"), "$1,235");
  assert.equal(formatMoney(-1234.5, "USD", { cents: true }), "-$1,234.50");
});

test("currency helpers: validation + locale guess", () => {
  assert.ok(isCurrency("USD"));
  assert.ok(!isCurrency("usd"));
  assert.ok(!isCurrency(undefined));
  assert.equal(guessCurrency("en-US"), "USD");
  assert.equal(guessCurrency("en-CA"), "CAD");
  assert.equal(guessCurrency("fr-CA"), "CAD");
  assert.equal(guessCurrency(undefined), "CAD");
});
