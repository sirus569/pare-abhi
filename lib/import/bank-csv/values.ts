// Cell-level parsing for bank CSVs: splitting the file into rows, money, and
// dates (including inferring MM/DD vs DD/MM from the data).

import { parseCsvLine } from "../csv";
import type { CsvRows, DateOrder } from "./types";

// Split a CSV document into non-blank rows of trimmed cells. Strips a UTF-8 BOM
// and \r (see the CRLF gotcha in CLAUDE.md). Line-based: a quoted field that
// spans lines is not supported — bank exports don't emit them.
export function toRows(text: string): CsvRows {
  return text
    .replace(/^﻿/, "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => parseCsvLine(l).map((c) => c.trim()));
}

// "1,234.56" · "-3.95" · "$12.00" · "(12.00)" · "12.00-" · "USD 5" → number.
// Blank / unparseable → null.
export function parseMoney(raw: string | undefined): number | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-$/.test(s)) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/[$,\s]|[A-Z]{3}/gi, "");
  if (!/^[+-]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return negative ? -Math.abs(n) : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 02/30
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Parse a date cell to YYYY-MM-DD. Numeric forms use `order` for the two
// ambiguous ones (a/b/yyyy); year-first and named-month forms are unambiguous.
export function parseDate(raw: string | undefined, order: DateOrder): string | null {
  const s = (raw ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    return order === "dmy" ? iso(y, b, a) : iso(y, a, b);
  }
  // "Jan 5, 2026" / "5 Jan 2026" / "05-Jan-2026"
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*\.?[\s-](\d{2}|\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

export function looksLikeDate(raw: string | undefined): boolean {
  return parseDate(raw, "mdy") !== null || parseDate(raw, "dmy") !== null;
}

// Infer the order of a date column from its values. Year-first → "ymd". For
// a/b/yyyy: any a > 12 proves DD/MM, any b > 12 proves MM/DD. null = every
// value is ambiguous (e.g. only 01/02-style dates) — the user must choose.
export function inferDateOrder(values: string[]): DateOrder | null {
  let mdy = false;
  let dmy = false;
  let ymd = false;
  for (const v of values) {
    if (/^\d{4}[-/.]/.test(v.trim())) ymd = true;
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/);
    if (!m) continue;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  if (ymd && !mdy && !dmy) return "ymd";
  if (mdy && !dmy) return "mdy";
  if (dmy && !mdy) return "dmy";
  // Named-month-only columns parse regardless of order.
  if (!mdy && !dmy && values.some((v) => /[A-Za-z]{3}/.test(v)) && values.every((v) => parseDate(v, "mdy"))) {
    return "mdy";
  }
  return null;
}

export const cents = (n: number) => Math.round(n * 100);
