"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";
import { PALETTE } from "@/lib/colors";
import {
  PROFILES,
  getProfile,
  parseBankCsv,
  suggestInvert,
  toRows,
  type CsvAccountKind,
  type CsvImportOptions,
  type CsvMapping,
  type DateOrder,
  type MappingSuggestion,
} from "@/lib/import/bank-csv";

// The CSV import panel on /upload. The bank-CSV parser is pure, so the preview
// below is the REAL parse of the file with the current options — what you see
// is exactly what the server will import (it re-parses with the same options).
//
// Institution picker: a known profile (strict layout rules — see
// lib/import/bank-csv/profiles.ts) or "Other institution" with an editable
// column mapping pre-filled by suggestMapping().

const selectClass =
  "border border-border bg-background font-mono text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-foreground";
const labelClass = "font-mono text-[10px] tracking-widest uppercase text-muted-foreground";

const KIND_LABELS: Record<CsvAccountKind, string> = {
  chequing: "Checking / chequing",
  savings: "Savings",
  card: "Credit card",
};
const DATE_ORDER_LABELS: Record<DateOrder, string> = {
  mdy: "MM/DD/YYYY",
  dmy: "DD/MM/YYYY",
  ymd: "YYYY-MM-DD",
};
const FLOW_LABELS: Record<string, string> = {
  spend: "SPEND",
  income: "INCOME",
  transfer: "TRANSFER",
  payment: "CARD PAYMENT",
  fee_interest: "FEE",
};

export interface CsvPending {
  id: string; // stable per dropped file — keys the panel so edits survive re-renders
  file: File;
  text: string;
  detected: string | null; // profile id that matched, if any
  suggestion: MappingSuggestion | null;
}

type Mapping = Omit<CsvMapping, "dateOrder"> & { dateOrder: DateOrder | null };

export function CsvImportPanel({
  pending,
  onImport,
  onSkip,
}: {
  pending: CsvPending;
  onImport: (options: CsvImportOptions) => void;
  onSkip: () => void;
}) {
  const rows = useMemo(() => toRows(pending.text), [pending.text]);
  const [institution, setInstitution] = useState(pending.detected ?? "other");
  const profile = getProfile(institution);
  const kinds: CsvAccountKind[] = profile?.kinds ?? ["chequing", "savings", "card"];
  const [kind, setKind] = useState<CsvAccountKind>(kinds[0]);
  const [accountName, setAccountName] = useState("");
  const [mapping, setMapping] = useState<Mapping | null>(() => {
    const m = pending.suggestion?.mapping ?? null;
    return m && m.dateOrder ? { ...m, invertSign: suggestInvert(rows, m as CsvMapping, kinds[0]) } : m;
  });

  const effectiveKind = kinds.includes(kind) ? kind : kinds[0];
  const setField = (patch: Partial<Mapping>) => setMapping((m) => (m ? { ...m, ...patch } : m));

  const changeKind = (k: CsvAccountKind) => {
    setKind(k);
    // Re-guess the sign convention for the new kind (card exports often print
    // charges positive; a deposit account's running balance settles it).
    if (mapping?.dateOrder) setField({ invertSign: suggestInvert(rows, mapping as CsvMapping, k) });
  };

  const options = useMemo<CsvImportOptions | null>(() => {
    if (institution !== "other") return { institution, kind: effectiveKind };
    if (!mapping || !mapping.dateOrder) return null;
    return { institution, kind: effectiveKind, accountName, mapping: mapping as CsvMapping };
  }, [institution, effectiveKind, accountName, mapping]);
  const result = useMemo(() => (options ? parseBankCsv(rows, options) : null), [rows, options]);
  const account = result?.ok ? result.parsed.accounts[0] : null;

  const headerCells = mapping && mapping.headerRow >= 0 ? rows[mapping.headerRow] : [];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const firstData = rows[(mapping?.headerRow ?? -1) + 1] ?? [];
  const columnOptions = [...Array(width).keys()].map((c) => {
    const name = headerCells[c] || `Column ${c + 1}`;
    const sample = firstData[c] ? ` — ${firstData[c].slice(0, 24)}` : "";
    return { value: c, label: `${name}${sample}` };
  });

  const columnSelect = (field: "date" | "description" | "amount" | "debit" | "credit" | "balance", optional = false) => (
    <select
      className={selectClass}
      value={mapping?.[field] === null ? "" : String(mapping?.[field])}
      onChange={(e) => setField({ [field]: e.target.value === "" ? null : Number(e.target.value) })}
    >
      {optional && <option value="">(none)</option>}
      {columnOptions.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const splitAmounts = mapping ? mapping.amount === null : false;

  return (
    <Card className="mt-6">
      <CardContent className="py-5 space-y-5">
        <div>
          <p className="font-mono text-sm font-medium uppercase tracking-wide">CSV IMPORT</p>
          <p className="text-xs text-muted-foreground break-words">
            {pending.file.name}
            {pending.detected && ` · looks like a ${getProfile(pending.detected)?.label} export`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Institution</span>
            <select className={selectClass} value={institution} onChange={(e) => setInstitution(e.target.value)}>
              {PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="other">Other institution</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Account type</span>
            <select
              className={selectClass}
              value={effectiveKind}
              onChange={(e) => changeKind(e.target.value as CsvAccountKind)}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {institution === "other" && (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Account name</span>
              <input
                className={selectClass}
                value={accountName}
                maxLength={60}
                placeholder="e.g. Everyday Chequing"
                onChange={(e) => setAccountName(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">
                Use the same name every time you import this account — it keeps its history together.
              </span>
            </label>
          )}
        </div>

        {profile && (
          <p className="text-[11px] text-muted-foreground">
            Always pick the same account type for the same {profile.label} account — the export
            doesn&apos;t record which account it came from.
          </p>
        )}

        {institution === "other" &&
          (mapping ? (
            <div className="space-y-3">
              <p className={labelClass}>Columns</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Data starts after row</span>
                  <select
                    className={selectClass}
                    value={mapping.headerRow}
                    onChange={(e) => setField({ headerRow: Number(e.target.value) })}
                  >
                    <option value={-1}>(first row is data)</option>
                    {rows.slice(0, 30).map((r, i) => (
                      <option key={i} value={i}>
                        {`Row ${i + 1} — ${r.join(", ").slice(0, 40)}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Date order</span>
                  <select
                    className={selectClass}
                    value={mapping.dateOrder ?? ""}
                    onChange={(e) => {
                      const dateOrder = e.target.value as DateOrder;
                      setField({
                        dateOrder,
                        invertSign: suggestInvert(rows, { ...mapping, dateOrder }, effectiveKind),
                      });
                    }}
                    style={mapping.dateOrder ? undefined : { borderColor: PALETTE.mustard }}
                  >
                    {!mapping.dateOrder && <option value="">Choose — dates are ambiguous</option>}
                    {(Object.keys(DATE_ORDER_LABELS) as DateOrder[]).map((o) => (
                      <option key={o} value={o}>
                        {DATE_ORDER_LABELS[o]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Date</span>
                  {columnSelect("date")}
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Description</span>
                  {columnSelect("description")}
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Amounts</span>
                  <select
                    className={selectClass}
                    value={splitAmounts ? "split" : "single"}
                    onChange={(e) =>
                      e.target.value === "split"
                        ? setField({ amount: null, debit: mapping.debit ?? 0, credit: mapping.credit ?? 0 })
                        : setField({ amount: mapping.amount ?? mapping.debit ?? 0, debit: null, credit: null })
                    }
                  >
                    <option value="single">One amount column</option>
                    <option value="split">Separate debit / credit columns</option>
                  </select>
                </label>
                {splitAmounts ? (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass}>Debit (money out)</span>
                      {columnSelect("debit")}
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass}>Credit (money in)</span>
                      {columnSelect("credit")}
                    </label>
                  </>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Amount</span>
                    {columnSelect("amount")}
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Running balance (optional)</span>
                  {columnSelect("balance", true)}
                </label>
              </div>
              {!splitAmounts && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={mapping.invertSign}
                    onChange={(e) => setField({ invertSign: e.target.checked })}
                  />
                  Flip signs — this export shows money going out as positive
                </label>
              )}
            </div>
          ) : (
            <p className="text-xs text-destructive">
              Couldn&apos;t find a date and amount in this file — is it a transaction export?
            </p>
          ))}

        <div className="space-y-2">
          <p className={labelClass}>Preview</p>
          {!result ? (
            <p className="text-xs text-muted-foreground">Choose the date order to see a preview.</p>
          ) : !result.ok ? (
            <p className="text-xs text-destructive">{result.error}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {account!.transactions.length} transactions · {account!.period}
                {account!.closing_balance !== null &&
                  ` · closing balance ${formatCents(account!.closing_balance)}`}
                {result.skippedRows > 0 && ` · ${result.skippedRows} unreadable rows skipped`}
              </p>
              {result.unreconciled > 0 && (
                <p className="text-xs" style={{ color: PALETTE.mustard }}>
                  {result.unreconciled} row{result.unreconciled === 1 ? "" : "s"} don&apos;t match
                  the running balance — check the amount columns and the flip-signs option.
                </p>
              )}
              <div className="border border-border divide-y divide-border">
                {account!.transactions.slice(0, 8).map((t, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                    <span className="font-mono text-muted-foreground shrink-0">{t.txn_date}</span>
                    <span className="truncate flex-1 min-w-0">{t.description}</span>
                    <span className="font-mono text-[10px] tracking-widest text-muted-foreground shrink-0">
                      {FLOW_LABELS[t.flow] ?? t.flow}
                    </span>
                    <span className="font-mono shrink-0 w-24 text-right">{formatCents(t.amount)}</span>
                  </div>
                ))}
              </div>
              {account!.transactions.length > 8 && (
                <p className="text-[11px] text-muted-foreground">
                  …and {account!.transactions.length - 8} more
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onSkip}>
            Skip
          </Button>
          <Button disabled={!result?.ok} onClick={() => options && onImport(options)}>
            Import {account ? `${account.transactions.length} transactions` : ""}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
