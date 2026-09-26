// "Other institution" support: find where the data starts and guess a column
// mapping, for the upload panel to pre-fill. Only a GUESS — the user sees the
// mapping and a live preview before anything is imported.

import { cents, inferDateOrder, looksLikeDate, parseMoney } from "./values";
import { PROFILES } from "./profiles";
import type { CsvAccountKind, CsvMapping, CsvRows, DateOrder } from "./types";

// Candidate header names, most specific first (compared lowercased, exact).
const DATE_H = ["date", "transaction date", "trans. date", "trans date", "posting date", "posted date", "post date", "value date"];
const DESC_H = ["description", "payee", "merchant", "name", "transaction description", "narrative", "details", "memo"];
const AMOUNT_H = ["amount", "transaction amount", "amount (usd)", "amount (cad)", "amt"];
const DEBIT_H = ["debit", "debits", "withdrawal", "withdrawals", "withdrawal amount", "money out", "paid out", "debit amount"];
const CREDIT_H = ["credit", "credits", "deposit", "deposits", "deposit amount", "money in", "paid in", "credit amount"];
const BALANCE_H = ["balance", "running balance", "running bal.", "running bal", "account balance"];

export interface MappingSuggestion {
  mapping: Omit<CsvMapping, "dateOrder"> & { dateOrder: DateOrder | null }; // null = ambiguous, user must pick
  columns: string[]; // display names: header cells, or "Column N"
}

function find(cells: string[], names: string[], taken: Set<number>): number {
  const lower = cells.map((c) => c.toLowerCase());
  for (const n of names) {
    const i = lower.indexOf(n);
    if (i !== -1 && !taken.has(i)) return i;
  }
  return -1;
}

// Share of `values` satisfying `pred`, ignoring blanks when `allowBlank`.
function share(values: string[], pred: (v: string) => boolean, allowBlank = false): number {
  const vs = allowBlank ? values.filter((v) => v !== "") : values;
  return vs.length ? vs.filter(pred).length / vs.length : 0;
}

const isMoney = (v: string) => parseMoney(v) !== null;

function columnValues(rows: CsvRows, from: number, col: number, limit = 50): string[] {
  return rows.slice(from, from + limit).map((r) => r[col] ?? "");
}

export function suggestMapping(rows: CsvRows): MappingSuggestion | null {
  // 1. A header row: a date-ish header plus an amount (or debit/credit) header.
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i];
    const taken = new Set<number>();
    const pick = (names: string[]) => {
      const idx = find(cells, names, taken);
      if (idx !== -1) taken.add(idx);
      return idx;
    };
    const date = pick(DATE_H);
    if (date === -1) continue;
    const amount = pick(AMOUNT_H);
    const debit = amount === -1 ? pick(DEBIT_H) : -1;
    const credit = amount === -1 ? pick(CREDIT_H) : -1;
    if (amount === -1 && (debit === -1 || credit === -1)) continue;
    const balance = pick(BALANCE_H);
    let description = pick(DESC_H);
    if (description === -1) description = textiestColumn(rows, i + 1, taken);
    if (description === -1) continue;

    return {
      columns: cells.map((c, k) => c || `Column ${k + 1}`),
      mapping: {
        headerRow: i,
        date,
        description,
        amount: amount === -1 ? null : amount,
        debit: debit === -1 ? null : debit,
        credit: credit === -1 ? null : credit,
        balance: balance === -1 ? null : balance,
        dateOrder: inferDateOrder(columnValues(rows, i + 1, date, 500)),
        invertSign: false,
      },
    };
  }

  // 2. No header (e.g. TD): data starts at the first row with a date and money.
  const start = rows.findIndex((r) => r.some(looksLikeDate) && r.some((c) => !looksLikeDate(c) && isMoney(c)));
  if (start === -1) return null;
  const width = Math.max(...rows.slice(start, start + 50).map((r) => r.length));
  const sample = (c: number) => columnValues(rows, start, c);
  const date = [...Array(width).keys()].find((c) => share(sample(c), looksLikeDate) >= 0.8) ?? -1;
  if (date === -1) return null;

  const taken = new Set([date]);
  const moneyCols = [...Array(width).keys()].filter(
    (c) => c !== date && share(sample(c), isMoney, true) >= 0.9 && sample(c).some((v) => v !== "")
  );
  const full = moneyCols.filter((c) => sample(c).every((v) => v !== ""));
  const sparse = moneyCols.filter((c) => !full.includes(c));

  let amount: number | null = null;
  let debit: number | null = null;
  let credit: number | null = null;
  let balance: number | null = null;
  if (sparse.length === 2) {
    // Two half-empty money columns: a debit/credit pair (first = debit, the
    // usual order). A fully-populated one alongside is the running balance.
    [debit, credit] = sparse;
    balance = full.at(-1) ?? null;
  } else if (full.length >= 1) {
    amount = full[0];
    balance = full.length >= 2 ? full.at(-1)! : null;
  }
  [amount, debit, credit, balance].forEach((c) => c !== null && taken.add(c));
  const description = textiestColumn(rows, start, taken);
  if (description === -1) return null;

  return {
    columns: [...Array(width).keys()].map((k) => `Column ${k + 1}`),
    mapping: {
      headerRow: start - 1,
      date,
      description,
      amount,
      debit,
      credit,
      balance,
      dateOrder: inferDateOrder(columnValues(rows, start, date, 500)),
      invertSign: false,
    },
  };
}

// The untaken column with the most letters on average — the description.
function textiestColumn(rows: CsvRows, from: number, taken: Set<number>): number {
  const sample = rows.slice(from, from + 50);
  const width = Math.max(0, ...sample.map((r) => r.length));
  let best = -1;
  let bestScore = 0;
  for (let c = 0; c < width; c++) {
    if (taken.has(c)) continue;
    const score = sample.reduce((n, r) => n + ((r[c] ?? "").match(/[A-Za-z]/g)?.length ?? 0), 0);
    if (score > bestScore) [best, bestScore] = [c, score];
  }
  return best;
}

// Guess whether the export's sign must be flipped so that NEGATIVE = money out.
// On a deposit account a running balance settles it (whichever sign
// reconciles). Card balances are amounts OWED — their sign convention varies by
// issuer, so they prove nothing; there the majority sign decides (most card
// rows are charges, so a mostly-positive export prints charges positive).
export function suggestInvert(rows: CsvRows, mapping: CsvMapping, kind: CsvAccountKind): boolean {
  if (mapping.amount === null) return false; // debit/credit pairs carry direction
  const data = rows.slice(mapping.headerRow + 1);
  if (kind !== "card" && mapping.balance !== null) {
    const misses = (rs: CsvRows, sign: number) => {
      let prev: number | null = null;
      let n = 0;
      for (const r of rs) {
        const amt = parseMoney(r[mapping.amount!]);
        const bal = parseMoney(r[mapping.balance!]);
        if (amt !== null && bal !== null && prev !== null && cents(prev + sign * amt) !== cents(bal)) n++;
        if (bal !== null) prev = bal;
      }
      return n;
    };
    // A newest-first file reconciles in reverse, so try both directions.
    const reversed = [...data].reverse();
    const plain = Math.min(misses(data, 1), misses(reversed, 1));
    const flipped = Math.min(misses(data, -1), misses(reversed, -1));
    if (plain !== flipped) return flipped < plain;
  }
  if (kind !== "card") return false;
  const amounts = data.map((r) => parseMoney(r[mapping.amount!])).filter((a): a is number => a !== null && a !== 0);
  return amounts.filter((a) => a > 0).length > amounts.length / 2;
}

// Which known profile (if any) this file matches — the picker's default.
export function detectProfile(rows: CsvRows): string | null {
  return PROFILES.find((p) => p.match(rows).ok)?.id ?? null;
}

