-- Per-user preferences. Single row (id = 1), same shape as app_user, but lives
-- in the user's DATA database so it exists on BOTH deploy targets: self-host's
-- file DB and the hosted per-user Durable Object (hosted identity lives in D1 /
-- better-auth, where app_user has no row).
--
-- currency: the ONE currency every amount is assumed to be in (see
-- lib/currency.ts). No CHECK constraint — the allowed list lives in code, so
-- adding a currency never needs a table rebuild. Existing installs were all
-- CAD, hence the default.
--
-- Not cleared by the /api/data WIPE (like rules/goals/account_meta).
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency TEXT NOT NULL DEFAULT 'CAD',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO user_settings (id) VALUES (1);
