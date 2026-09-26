// Transaction types ("flow") — the client-safe half: the legal values, their
// labels, keyword matching, and the keyword a type rule is suggested with. The
// DB half (rules table, applying rules, manual edits) is lib/db/transaction-types.ts.

export const FLOWS = ["spend", "income", "transfer", "payment", "fee_interest"] as const;
export type Flow = (typeof FLOWS)[number];

export const FLOW_LABELS: Record<Flow, string> = {
  spend: "Spend",
  income: "Income",
  transfer: "Transfer",
  payment: "Card payment",
  fee_interest: "Fee / interest",
};

export function isFlow(value: unknown): value is Flow {
  return typeof value === "string" && (FLOWS as readonly string[]).includes(value);
}

export interface TypeRule {
  id: number;
  keyword: string;
  flow: Flow;
  sort_order: number;
  created_at: string;
}

// First rule (by sort_order) whose keyword is a case-insensitive substring of
// the description — the same matching as category rules.
export function matchTypeRule(description: string, rules: Pick<TypeRule, "keyword" | "flow">[]): Flow | null {
  const d = description.toUpperCase();
  for (const rule of rules) {
    if (d.includes(rule.keyword.toUpperCase())) return rule.flow;
  }
  return null;
}

// Suggested keyword for "always treat this as <type>". A type is about the
// KIND of movement, so the suggestion is deliberately broad — and when the
// description names a direction ("Zelle payment to Babysitter"), it stops at
// that word ("ZELLE PAYMENT TO"), so the rule can't also catch money coming
// the other way ("… from …"). Otherwise: the description up to the first
// digit-bearing token (ids, dates, amounts), which rules shouldn't key on.
export function suggestTypeKeyword(description: string): string {
  const words = description.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const dir = words.findIndex((w, i) => i > 0 && (w === "TO" || w === "FROM"));
  if (dir !== -1) return words.slice(0, dir + 1).join(" ");
  const firstDigit = words.findIndex((w) => /\d/.test(w));
  const kept = firstDigit > 0 ? words.slice(0, firstDigit) : words;
  return kept.slice(0, 4).join(" ");
}
