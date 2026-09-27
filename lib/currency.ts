// The user's display currency — client-safe (no DB imports), shared by the
// formatter (lib/format.ts), the settings store (lib/db/settings.ts), the
// /api/settings route and the pickers (signup + /profile).
//
// Pare is SINGLE-currency by design: every amount in the database is assumed
// to be in this one currency. There is no per-account currency and no FX
// conversion — a user holding accounts in two real-world currencies converts
// themselves. The setting only changes how amounts are labelled/formatted.
//
// Adding a currency = one entry here (code + label + locale). No migration:
// user_settings.currency is plain TEXT, validated in code (isCurrency).

export const CURRENCIES = ["CAD", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Existing installs predate the setting and were all CAD.
export const DEFAULT_CURRENCY: Currency = "CAD";

export const CURRENCY_LABELS: Record<Currency, string> = {
  CAD: "CAD — Canadian dollar",
  USD: "USD — US dollar",
};

// Each currency formats in its home locale so the symbol is the bare "$" —
// en-CA + USD would render "US$", en-US + CAD "CA$". In a single-currency app
// the qualifier is noise.
export const CURRENCY_LOCALES: Record<Currency, string> = {
  CAD: "en-CA",
  USD: "en-US",
};

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

// First-run default for the signup picker: a browser locale ending in -US
// suggests USD, anything else keeps the historical CAD default. Only a
// suggestion — the user confirms it on the form.
export function guessCurrency(locale: string | undefined): Currency {
  return /-US$/i.test(locale ?? "") ? "USD" : DEFAULT_CURRENCY;
}
