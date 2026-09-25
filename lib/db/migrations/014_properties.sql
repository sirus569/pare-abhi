-- Properties: real-estate tracking (address, mortgage, recurring expenses,
-- rental income). Standalone for now — Net Worth/Income/Cashflow/Forecast
-- integration is a deliberate later phase, not wired in this migration.
--
-- Mortgage balance is a manually-updated snapshot (outstanding_amount), NOT
-- auto-amortized — consistent with the rest of the app's point-in-time
-- philosophy (statement-cadence net worth, manual_entries). Property value
-- is a dated history (property_value_history), same shape as manual_entries,
-- so re-adding a value with a later effective_date builds an appreciation
-- trend instead of overwriting a single number.
--
-- One mortgage row per property (no refi/second-mortgage modeling yet).
-- No ON DELETE CASCADE (this codebase never uses it, see 013's note) —
-- deleteProperty() in lib/db/properties.ts deletes children explicitly.
--
-- Deliberately WIPED by DELETE /api/data {confirm:"WIPE"}, unlike
-- rules/goals/marks/account_meta which survive it — a documented deviation
-- from that convention (this table is data about the property, not
-- configuration of how the transaction data is read).

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  property_type TEXT NOT NULL CHECK (property_type IN ('primary', 'rental', 'vacation', 'other')),
  monthly_rental_income REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS property_mortgages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL UNIQUE REFERENCES properties(id),
  outstanding_amount REAL NOT NULL,
  date_opened TEXT NOT NULL,
  rate REAL NOT NULL,
  amortization_years INTEGER NOT NULL,
  calculated_payment REAL,
  payment_override REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS property_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  label TEXT NOT NULL,
  monthly_amount REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_property_expenses_property ON property_expenses(property_id);

CREATE TABLE IF NOT EXISTS property_value_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  value REAL NOT NULL,
  effective_date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_property_value_history_property
  ON property_value_history(property_id, effective_date DESC);
