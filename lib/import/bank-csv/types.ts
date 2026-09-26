// Shared types for the bank-CSV importer (lib/import/bank-csv/). Pure — the same
// code runs in the browser (live preview on /upload) and on the server (the
// authoritative re-parse in /api/upload).

import type { OfxImport } from "../ofx";

// Account kinds a CSV can be imported as. A subset of AccountKind: the source
// suffix (`_chequing` / `_savings` / `_card`) is what sourceToKind() keys off.
export type CsvAccountKind = "chequing" | "savings" | "card";
export const CSV_ACCOUNT_KINDS: CsvAccountKind[] = ["chequing", "savings", "card"];

export type DateOrder = "mdy" | "dmy" | "ymd";

// Where each field lives, as 0-based column indices. `headerRow` indexes the
// file's non-blank rows (-1 = the file has no header row).
export interface CsvMapping {
  headerRow: number;
  date: number;
  description: number;
  // Either one signed amount column, or a debit/credit pair of magnitudes.
  amount: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null; // running balance — soft reconciliation + closing balance
  dateOrder: DateOrder;
  // Normalized sign: NEGATIVE = money out of the holder's pocket (withdrawal,
  // card charge). Exports that print card charges positive need this flipped.
  invertSign: boolean;
}

export interface CsvImportOptions {
  institution: string; // a profile id (PROFILES) or "other"
  kind: CsvAccountKind;
  accountName?: string; // "other" only — names the account (and its source)
  mapping?: CsvMapping; // "other" only — profiles resolve their own
}

export type CsvRows = string[][]; // non-blank lines, split into trimmed cells

export interface CsvParseSuccess {
  ok: true;
  parsed: OfxImport; // exactly one account
  // Rows whose printed running balance ≠ previous balance + amount. Soft
  // check: reported, never fatal.
  unreconciled: number;
  // Data rows dropped because the date or amount didn't parse (amount-less
  // balance rows like BoA's "Beginning balance" line are NOT counted).
  skippedRows: number;
}

export type CsvParseResult = CsvParseSuccess | { ok: false; error: string };

// A known institution's export layout. `match` is STRICT: when the user picks
// the institution, a file that doesn't fit is refused with `reason`, rather
// than being half-parsed as something it isn't.
export interface BankCsvProfile {
  id: string;
  label: string; // shown in the institution picker
  sourcePrefix: string; // source = `${sourcePrefix}_${kind}`
  accountLabel: string; // "BANK OF AMERICA" → "BANK OF AMERICA CHECKING"
  kinds: CsvAccountKind[]; // account kinds this export can hold
  match(rows: CsvRows): { ok: true; mapping: CsvMapping } | { ok: false; reason: string };
  // Closing balance/date from a summary block, when the export has one.
  summary?(rows: CsvRows): { closing_balance: number; closing_date: string } | null;
  cleanDescription?(raw: string): string;
}
