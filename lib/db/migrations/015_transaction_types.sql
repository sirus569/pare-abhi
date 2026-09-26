-- Editable transaction types (lib/db/transaction-types.ts). `flow` stays the
-- EFFECTIVE type every chart reads; these columns record where it came from:
--
--   original_flow  the type the importer assigned, kept ONLY once something has
--                  changed `flow` (NULL = never changed, `flow` is the original).
--                  Lets type rules be re-applied from scratch and lets a manual
--                  edit be reset.
--   flow_manual    1 = the user set the type by hand; type rules skip the row.
--
-- Precedence: manual edit > first matching type rule > original_flow.
ALTER TABLE transactions ADD COLUMN original_flow TEXT
  CHECK (original_flow IS NULL OR original_flow IN ('spend', 'payment', 'income', 'transfer', 'fee_interest'));
ALTER TABLE transactions ADD COLUMN flow_manual INTEGER NOT NULL DEFAULT 0;

-- Keyword → type rules, first match (by sort_order) wins — the same model as
-- category_rules but a separate table: a type says what KIND of money movement
-- a row is, a category says what it was FOR, and they want different keywords
-- ("Zelle payment to" → spend vs "Zelle payment to Babysitter" → Childcare).
-- Kept by the /api/data WIPE like rules/goals (user intent, not data).
CREATE TABLE IF NOT EXISTS type_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword    TEXT NOT NULL UNIQUE,
  flow       TEXT NOT NULL CHECK (flow IN ('spend', 'payment', 'income', 'transfer', 'fee_interest')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
