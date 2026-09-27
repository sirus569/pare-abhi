import { getDb } from "../db";
import { DEFAULT_CURRENCY, isCurrency, type Currency } from "../currency";

// User preferences (migration 017, single-row `user_settings`). Runs inside the
// repo, so on hosted it reads the caller's Durable Object — never a shared row.

export interface UserSettings {
  currency: Currency;
}

export function getSettings(): UserSettings {
  const row = getDb()
    .prepare("SELECT currency FROM user_settings WHERE id = 1")
    .get() as { currency: string } | undefined;
  // An unknown stored value (a currency removed from the list) falls back to
  // the default rather than handing Intl a code the pickers can't show.
  return { currency: isCurrency(row?.currency) ? row.currency : DEFAULT_CURRENCY };
}

export function getCurrency(): Currency {
  return getSettings().currency;
}

export function setCurrency(currency: Currency): void {
  if (!isCurrency(currency)) throw new Error(`unsupported currency: ${currency}`);
  getDb()
    .prepare(
      `INSERT INTO user_settings (id, currency, updated_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET currency = excluded.currency, updated_at = excluded.updated_at`
    )
    .run(currency);
}
