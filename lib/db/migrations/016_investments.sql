-- Investments: long-term investment + retirement accounts (401k, IRA,
-- brokerage, …) tracked as a dated balance history. Net worth ONLY — no
-- Income/Cashflow/Forecast/Baseline wiring (those read transactions; these
-- tables are never joined into them).
--
-- The account is a first-class row so balance updates pick it by id instead of
-- re-typing a name (the manual_entries failure mode: a typo'd name silently
-- starts a second account). Net worth keys the timeline `investment:{id}`, so a
-- rename never splits or merges history.
--
-- account_type is WHAT the account is, not a tax bucket — tax treatment /
-- retirement-vs-liquid can be derived from it later without a schema change.
--
-- One balance per account per date (UNIQUE) — re-entering a date replaces it,
-- so correcting a typo'd balance is just "update balance" again.
-- No ON DELETE CASCADE (this codebase never uses it, see 013's note) —
-- deleteInvestmentAccount() in lib/db/investments.ts deletes children first.
--
-- Deliberately WIPED by DELETE /api/data {confirm:"WIPE"}, like properties
-- (migration 014) and unlike rules/goals/marks/account_meta.

CREATE TABLE IF NOT EXISTS investment_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN
    ('401k', 'ira', 'roth_ira', 'brokerage', 'hsa', 'pension', 'rrsp', 'tfsa', 'other')),
  institution TEXT,
  note TEXT,
  closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS investment_balance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES investment_accounts(id),
  balance REAL NOT NULL,
  as_of_date TEXT NOT NULL,
  UNIQUE (account_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_investment_balance_history_account
  ON investment_balance_history(account_id, as_of_date DESC);
