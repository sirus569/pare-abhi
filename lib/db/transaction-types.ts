// Editable transaction types (migration 015). `transactions.flow` stays the
// EFFECTIVE type every chart and list reads; this module owns how it's derived:
//
//   manual edit (flow_manual = 1)  >  first matching type rule  >  original_flow
//
// `original_flow` is the importer's type, stored only once something has
// changed `flow` (NULL = untouched). That makes applyTypeRules() re-runnable
// from scratch — deleting a rule restores the imported type — and lets a manual
// edit be reset.
//
// Type is decided BEFORE category: recategorizeAll() calls applyTypeRules()
// first, because which category rules may apply depends on the type (deposit
// transfers only take user categories; income/payment/fee are never
// re-categorized). Every import path already ends in recategorizeAll(), so
// type rules reach fresh imports automatically.

import { getDb } from "../db";
import { isFlow, matchTypeRule, type Flow, type TypeRule } from "../transaction-types";
import { loadUserTypeRules, removeUserTypeRule, saveUserTypeRule } from "./user-rules";

export function listTypeRules(): TypeRule[] {
  return getDb().prepare("SELECT * FROM type_rules ORDER BY sort_order ASC, id ASC").all() as TypeRule[];
}

// Restore type rules from the wipe-survival file when the table is empty (a
// fresh DB). Called from seedCategoryRules(), which every import path runs.
export function seedTypeRules(): void {
  const db = getDb();
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM type_rules").get() as { count: number };
  if (count > 0) return;
  const insert = db.prepare("INSERT OR IGNORE INTO type_rules (keyword, flow, sort_order) VALUES (?, ?, ?)");
  let order = 0;
  for (const r of loadUserTypeRules()) {
    if (r.keyword?.trim() && isFlow(r.flow)) insert.run(r.keyword.trim(), r.flow, order++);
  }
}

export function addTypeRule(keyword: string, flow: Flow): void {
  const kw = keyword.trim();
  if (!kw) throw new Error("Keyword required");
  if (!isFlow(flow)) throw new Error("Unknown type");
  const db = getDb();
  const clash = db
    .prepare("SELECT 1 FROM type_rules WHERE UPPER(keyword) = UPPER(?)")
    .get(kw);
  if (clash) throw new Error(`A type rule for "${kw}" already exists`);
  const { max } = db.prepare("SELECT MAX(sort_order) AS max FROM type_rules").get() as { max: number | null };
  db.prepare("INSERT INTO type_rules (keyword, flow, sort_order) VALUES (?, ?, ?)").run(kw, flow, (max ?? 0) + 1);
  saveUserTypeRule(kw, flow);
}

export function deleteTypeRule(id: number): void {
  const db = getDb();
  const row = db.prepare("SELECT keyword FROM type_rules WHERE id = ?").get(id) as { keyword: string } | undefined;
  db.prepare("DELETE FROM type_rules WHERE id = ?").run(id);
  if (row) removeUserTypeRule(row.keyword);
}

export interface TypeRulePreview {
  count: number; // every matching transaction, incl. hidden accounts
  manual: number; // of those, rows with a hand-set type (the rule won't touch them)
  samples: { id: number; txn_date: string; description: string; flow: Flow; source: string }[];
}

// What a keyword would match — shown before a rule is saved, so a keyword that
// also catches money going the other way ("Zelle" vs "Zelle payment to") is
// visible up front.
export function previewTypeRule(keyword: string): TypeRulePreview {
  const kw = keyword.trim();
  if (!kw) return { count: 0, manual: 0, samples: [] };
  const db = getDb();
  const where = "WHERE UPPER(description) LIKE '%' || UPPER(@kw) || '%'";
  const { count, manual } = db
    .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(flow_manual), 0) AS manual FROM transactions ${where}`)
    .get({ kw }) as { count: number; manual: number };
  const samples = db
    .prepare(
      `SELECT id, txn_date, description, flow, source FROM transactions ${where}
       ORDER BY txn_date DESC, id DESC LIMIT 8`
    )
    .all({ kw }) as TypeRulePreview["samples"];
  return { count, manual, samples };
}

// Re-derive `flow` for every row without a manual type: first matching rule,
// else the imported type. Returns how many rows changed type.
export function applyTypeRules(): number {
  const db = getDb();
  const rules = listTypeRules();
  const rows = db
    .prepare("SELECT id, description, flow, original_flow FROM transactions WHERE flow_manual = 0")
    .all() as { id: number; description: string; flow: Flow; original_flow: Flow | null }[];

  const update = db.prepare("UPDATE transactions SET flow = ?, original_flow = ? WHERE id = ?");
  let changed = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const base = row.original_flow ?? row.flow;
      const next = matchTypeRule(row.description, rules) ?? base;
      const original = next === base ? null : base;
      if (next === row.flow && original === row.original_flow) continue;
      update.run(next, original, row.id);
      if (next !== row.flow) changed++;
    }
  });
  tx();
  return changed;
}

export interface TransactionTypeState {
  flow: Flow;
  original_flow: Flow; // the imported type (== flow when never changed)
  manual: boolean;
}

export function typeOf(id: number): TransactionTypeState | null {
  const row = getDb()
    .prepare("SELECT flow, original_flow, flow_manual FROM transactions WHERE id = ?")
    .get(id) as { flow: Flow; original_flow: Flow | null; flow_manual: number } | undefined;
  return row ? { flow: row.flow, original_flow: row.original_flow ?? row.flow, manual: row.flow_manual === 1 } : null;
}

// Hand-set a row's type. Pins it: type rules skip it until reset. Returns
// false when the row doesn't exist. The caller re-runs category rules (the
// row's category eligibility depends on its type).
export function setTransactionType(id: number, flow: Flow): boolean {
  if (!isFlow(flow)) throw new Error("Unknown type");
  const result = getDb()
    .prepare(
      `UPDATE transactions
         SET original_flow = COALESCE(original_flow, flow), flow = ?, flow_manual = 1
       WHERE id = ?`
    )
    .run(flow, id);
  return result.changes > 0;
}

// Undo a manual type: back to automatic (a matching type rule, else the
// imported type). Returns false when the row doesn't exist.
export function resetTransactionType(id: number): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT description, flow, original_flow FROM transactions WHERE id = ?")
    .get(id) as { description: string; flow: Flow; original_flow: Flow | null } | undefined;
  if (!row) return false;
  const base = row.original_flow ?? row.flow;
  const next = matchTypeRule(row.description, listTypeRules()) ?? base;
  db.prepare("UPDATE transactions SET flow = ?, original_flow = ?, flow_manual = 0 WHERE id = ?").run(
    next,
    next === base ? null : base,
    id
  );
  return true;
}
