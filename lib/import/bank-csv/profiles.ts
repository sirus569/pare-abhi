// Known-institution CSV layouts. Add a profile ONLY with a real export in hand
// (redacted) — a layout reconstructed from docs is a guess, and `match` is
// strict precisely so a guess can't quietly mis-parse someone's money. Anything
// else goes through the "Other institution" path (detect.ts + manual mapping).

import { parseMoney, parseDate } from "./values";
import type { BankCsvProfile, CsvRows } from "./types";

// ---------------------------------------------------------------------------
// Bank of America — checking/savings activity CSV (BoA dropped its QFX export).
// A summary block, then the ledger:
//
//   Description,,Summary Amt.
//   Beginning balance as of 01/01/2026,,"1,000.00"
//   Total credits,,"…"
//   Total debits,,"-…"
//   Ending balance as of 01/31/2026,,"1,234.56"
//   Date,Description,Amount,Running Bal.
//   01/01/2026,Beginning balance as of 01/01/2026,,"1,000.00"
//   01/02/2026,"SOME MERCHANT …","-12.34","987.66"
//
// The file names neither the bank nor the account, so this fingerprint is the
// whole identification: every summary line in order, the exact ledger header,
// and the ledger's own "Beginning balance" row agreeing with the summary's.
// ---------------------------------------------------------------------------

const BOA_SUMMARY: { re: RegExp; label: string }[] = [
  { re: /^Description$/i, label: "Description,,Summary Amt." },
  { re: /^Beginning balance as of \d{2}\/\d{2}\/\d{4}$/i, label: "Beginning balance as of …" },
  { re: /^Total credits$/i, label: "Total credits" },
  { re: /^Total debits$/i, label: "Total debits" },
  { re: /^Ending balance as of \d{2}\/\d{2}\/\d{4}$/i, label: "Ending balance as of …" },
];
const BOA_HEADER = ["date", "description", "amount", "running bal."];

function boaSummaryValue(rows: CsvRows, re: RegExp) {
  const row = rows.find((r) => re.test(r[0] ?? ""));
  return row ? { label: row[0], amount: parseMoney(row[2]) } : null;
}

// BoA ACH lines are `ORIGINATOR DES:TYPE ID:… INDN:<account holder name> CO
// ID:… WEB`: the ids change every transaction (which would stop recurring
// detection from grouping them) and INDN is the user's own name, which has no
// business in merchant names or rules. Cut from the first ID:/INDN:/CO ID:
// field. Zelle confirmation numbers and debit-card reference tails likewise.
export function cleanBoaDescription(raw: string): string {
  let d = raw;
  d = d.replace(/\s+(?:ID|INDN|CO ID):.*$/i, "");
  d = d.replace(/[;,]?\s*Conf#\s*\S+/gi, "");
  d = d.replace(/^(?:CHECKCARD|PURCHASE)\s+\d{4}\s+/i, "");
  d = d.replace(/\s+\d{12,}\s*(?:CKCD|RECURRING)?\s*$/i, "");
  d = d.replace(/\s+/g, " ").trim();
  return d || raw.trim();
}

const boa: BankCsvProfile = {
  id: "boa",
  label: "Bank of America",
  sourcePrefix: "boa",
  accountLabel: "BANK OF AMERICA",
  kinds: ["chequing", "savings"],

  match(rows) {
    const nope = (why: string) => ({
      ok: false as const,
      reason: `Doesn't look like a Bank of America activity export: ${why}. If it's from another bank, choose "Other institution".`,
    });

    let at = 0;
    for (const { re, label } of BOA_SUMMARY) {
      while (at < rows.length && !re.test(rows[at][0] ?? "")) at++;
      if (at === rows.length) return nope(`missing the "${label}" summary line`);
      at++;
    }
    if (rows[0]?.[2]?.toLowerCase() !== "summary amt.") return nope('the first line isn\'t "Description,,Summary Amt."');

    const headerRow = rows.findIndex(
      (r) => r.length >= 4 && BOA_HEADER.every((h, i) => (r[i] ?? "").toLowerCase() === h)
    );
    if (headerRow === -1) return nope('no "Date,Description,Amount,Running Bal." header');

    const begin = boaSummaryValue(rows, BOA_SUMMARY[1].re);
    const ledgerBegin = rows[headerRow + 1];
    if (
      !begin ||
      !ledgerBegin ||
      (ledgerBegin[1] ?? "").toLowerCase() !== begin.label.toLowerCase() ||
      parseMoney(ledgerBegin[3]) !== begin.amount
    ) {
      return nope("the ledger's opening balance row doesn't match the summary");
    }

    return {
      ok: true,
      mapping: {
        headerRow,
        date: 0,
        description: 1,
        amount: 2,
        debit: null,
        credit: null,
        balance: 3,
        dateOrder: "mdy",
        invertSign: false,
      },
    };
  },

  summary(rows) {
    const end = boaSummaryValue(rows, BOA_SUMMARY[4].re);
    const date = parseDate(end?.label.match(/(\d{2}\/\d{2}\/\d{4})$/)?.[1], "mdy");
    return end && end.amount !== null && date ? { closing_balance: end.amount, closing_date: date } : null;
  },

  cleanDescription: cleanBoaDescription,
};

export const PROFILES: BankCsvProfile[] = [boa];

export function getProfile(id: string): BankCsvProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}
