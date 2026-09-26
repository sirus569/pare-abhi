// Client-safe investment account types (no DB imports) — shared by the
// /investments page, the API route, and lib/db/investments.ts. Must match the
// CHECK constraint in migration 016.

export const INVESTMENT_ACCOUNT_TYPES = [
  "401k",
  "ira",
  "roth_ira",
  "brokerage",
  "hsa",
  "pension",
  "rrsp",
  "tfsa",
  "other",
] as const;

export type InvestmentAccountType = (typeof INVESTMENT_ACCOUNT_TYPES)[number];

export const INVESTMENT_ACCOUNT_TYPE_LABELS: Record<InvestmentAccountType, string> = {
  "401k": "401(K)",
  ira: "IRA",
  roth_ira: "ROTH IRA",
  brokerage: "BROKERAGE",
  hsa: "HSA",
  pension: "PENSION",
  rrsp: "RRSP",
  tfsa: "TFSA",
  other: "OTHER",
};

export function isInvestmentAccountType(v: unknown): v is InvestmentAccountType {
  return (INVESTMENT_ACCOUNT_TYPES as readonly unknown[]).includes(v);
}
