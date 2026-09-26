// ---------------------------------------------------------------------------
// Bank-CSV import — one pure parse path for every institution. The panel on
// /upload runs it for the live preview; /api/upload re-runs it (authoritative)
// with the same options and feeds the result to insertOfxImport — the OFX
// statement path, so rows are rules-categorized like any statement and the
// account lights up every chart via its source suffix.
//
// Why rows carry a SYNTHETIC fitId: CSV exports have no bank transaction id.
// The id is built from the RAW row content (date|description|amount) plus a
// same-day duplicate counter. Re-importing an overlapping download is
// idempotent because a day is always wholly inside or outside a download
// window. RAW description on purpose: display cleaning can evolve without
// changing dedup keys (which would double every re-imported row).
//
// Direction: amounts are normalized to NEGATIVE = money out (mapping.invertSign
// flips exports that print charges positive), stored as magnitudes with `flow`
// carrying direction (classify.ts).
//
// Running balance (deposit accounts only): a SOFT reconciliation check —
// mismatches are counted and surfaced, never fatal — and the fallback closing
// balance when the profile has no summary block. Card balances are left NULL,
// same as the OFX card path (issuer sign conventions are inconsistent).
// ---------------------------------------------------------------------------

import { getProfile } from "./profiles";
import { classifyCsvRow } from "./classify";
import { cents, parseDate, parseMoney, toRows } from "./values";
import type { OfxAccount, OfxTransaction } from "../ofx";
import type { CsvImportOptions, CsvMapping, CsvParseResult, CsvRows } from "./types";

const KIND_LABEL = { chequing: "CHECKING", savings: "SAVINGS", card: "CARD" } as const;

// "Joint Chequing!" → "joint_chequing" — the account-name part of a source.
export function slugifyAccountName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24)
    .replace(/_+$/, "");
}

function validMapping(m: CsvMapping, width: number): string | null {
  const inRange = (c: number | null) => c === null || (Number.isInteger(c) && c >= 0 && c < width);
  if (![m.date, m.description, m.amount, m.debit, m.credit, m.balance].every(inRange)) {
    return "A mapped column doesn't exist in this file.";
  }
  if (m.amount === null && (m.debit === null || m.credit === null)) {
    return "Map either an Amount column, or both Debit and Credit columns.";
  }
  if (m.date === m.description) return "Date and Description must be different columns.";
  return null;
}

export function parseBankCsv(input: string | CsvRows, opts: CsvImportOptions): CsvParseResult {
  const rows = typeof input === "string" ? toRows(input) : input;
  if (rows.length === 0) return { ok: false, error: "The file is empty." };

  // Resolve the layout: a known profile's strict match, or the user's mapping.
  let mapping: CsvMapping;
  let source: string;
  let accountLabel: string;
  const profile = opts.institution === "other" ? undefined : getProfile(opts.institution);
  if (profile) {
    if (!profile.kinds.includes(opts.kind)) {
      return { ok: false, error: `${profile.label} CSVs can't be imported as a ${KIND_LABEL[opts.kind].toLowerCase()} account.` };
    }
    const match = profile.match(rows);
    if (!match.ok) return { ok: false, error: match.reason };
    mapping = match.mapping;
    source = `${profile.sourcePrefix}_${opts.kind}`;
    accountLabel = `${profile.accountLabel} ${KIND_LABEL[opts.kind]}`;
  } else if (opts.institution === "other") {
    const slug = slugifyAccountName(opts.accountName ?? "");
    if (!slug) return { ok: false, error: "Give the account a name." };
    if (!opts.mapping) return { ok: false, error: "Map the file's columns first." };
    mapping = opts.mapping;
    const width = Math.max(...rows.map((r) => r.length));
    const invalid = validMapping(mapping, width);
    if (invalid) return { ok: false, error: invalid };
    source = `csv_${slug}_${opts.kind}`;
    accountLabel = `${opts.accountName!.trim().toUpperCase()} ${KIND_LABEL[opts.kind]}`;
  } else {
    return { ok: false, error: "Unknown institution." };
  }

  // Walk the data rows (file order) into normalized rows.
  type Row = { date: string; raw: string; signed: number | null; balance: number | null };
  const walked: Row[] = [];
  let skippedRows = 0;
  for (const r of rows.slice(mapping.headerRow + 1)) {
    const date = parseDate(r[mapping.date], mapping.dateOrder);
    let signed: number | null;
    if (mapping.amount !== null) {
      signed = parseMoney(r[mapping.amount]);
    } else {
      const debit = parseMoney(r[mapping.debit!]);
      const credit = parseMoney(r[mapping.credit!]);
      signed = debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (signed !== null && mapping.invertSign) signed = -signed;
    const balance = mapping.balance !== null ? parseMoney(r[mapping.balance]) : null;

    if (date === null) {
      skippedRows++;
      continue;
    }
    // Amount-less rows (BoA's "Beginning balance" line) only carry a balance.
    if (signed === null && balance === null) {
      skippedRows++;
      continue;
    }
    walked.push({ date, raw: r[mapping.description] ?? "", signed, balance });
  }

  // Chronological order: files are oldest-first or newest-first.
  const descending = walked.length > 1 && walked[0].date > walked[walked.length - 1].date;
  const chrono = descending ? [...walked].reverse() : walked;

  const isCard = opts.kind === "card";
  let unreconciled = 0;
  let prevBalance: number | null = null;
  const transactions: OfxTransaction[] = [];
  const seen = new Map<string, number>();

  for (const row of chrono) {
    if (!isCard && row.balance !== null) {
      if (row.signed !== null && prevBalance !== null && cents(prevBalance + row.signed) !== cents(row.balance)) {
        unreconciled++;
      }
      prevBalance = row.balance;
    }
    if (row.signed === null || row.signed === 0) continue;

    const contentKey = `${row.date}|${row.raw}|${cents(row.signed)}`;
    const seq = (seen.get(contentKey) ?? 0) + 1;
    seen.set(contentKey, seq);

    const description = (profile?.cleanDescription?.(row.raw) ?? row.raw.replace(/\s+/g, " ").trim()) || "CSV TRANSACTION";
    transactions.push({
      fitId: `csv|${contentKey}|${seq}`,
      txn_date: row.date,
      description,
      amount: Math.abs(row.signed),
      ...classifyCsvRow(opts.kind, description, row.signed),
    });
  }

  if (transactions.length === 0) {
    return { ok: false, error: "No transactions found — check the column mapping and date order." };
  }

  // Closing balance (deposit accounts): the profile's summary, else the last
  // running balance in chronological order.
  let closing_balance: number | null = null;
  let closing_date: string | null = null;
  if (!isCard) {
    const summary = profile?.summary?.(rows);
    if (summary) {
      ({ closing_balance, closing_date } = summary);
    } else {
      const last = [...chrono].reverse().find((r) => r.balance !== null);
      if (last) [closing_balance, closing_date] = [last.balance, last.date];
    }
  }

  const dates = transactions.map((t) => t.txn_date).sort();
  const end = closing_date && closing_date > dates[dates.length - 1] ? closing_date : dates[dates.length - 1];
  const account: OfxAccount = {
    source,
    account: accountLabel,
    account_kind: opts.kind,
    period: `${dates[0]} to ${end}`,
    closing_balance,
    closing_date,
    transactions,
  };

  return { ok: true, parsed: { accounts: [account] }, unreconciled, skippedRows };
}
