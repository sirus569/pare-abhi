"use client";

import { useEffect, useState } from "react";
import {
  FLOWS,
  FLOW_LABELS,
  suggestTypeKeyword,
  type Flow,
} from "@/lib/transaction-types";

// TYPE section of the transaction dialog: change one row's type (a manual edit
// that type rules won't override), reset it to automatic, and — right after a
// change — offer to make it a type rule for every matching transaction, with a
// live preview of what the keyword catches (so a keyword that would also catch
// money going the other way is visible before saving).

const selectClass =
  "border border-border bg-background font-mono text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-foreground";
const labelClass = "font-mono text-[10px] tracking-widest uppercase text-muted-foreground";
const linkClass =
  "font-mono text-xs tracking-widest uppercase underline underline-offset-2 text-muted-foreground hover:text-foreground disabled:opacity-50";

export interface TypeEditorTx {
  id: number;
  description: string;
  flow: string;
  original_flow: string | null;
  flow_manual: number;
}

interface Preview {
  count: number;
  manual: number;
  samples: { id: number; txn_date: string; description: string; flow: Flow }[];
}

export function TypeEditor({
  tx,
  onChanged,
}: {
  tx: TypeEditorTx;
  // Called after any saved change; the page refreshes its list and row.
  onChanged: (next: { flow: string; original_flow: string | null; flow_manual: number }) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<Flow | null>(null); // "always treat … as <offer>?"
  const [keyword, setKeyword] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ruleAdded, setRuleAdded] = useState<string | null>(null);

  const imported = (tx.original_flow ?? tx.flow) as Flow;

  // Debounced preview of the offered rule's keyword.
  useEffect(() => {
    if (!offer || !keyword.trim()) return;
    const t = setTimeout(() => {
      fetch(`/api/type-rules?preview=${encodeURIComponent(keyword.trim())}`)
        .then((r) => r.json())
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [offer, keyword]);

  const setType = async (flow: Flow) => {
    setSaving(true);
    setError(null);
    setRuleAdded(null);
    const res = await fetch("/api/transactions/type", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_id: tx.id, flow }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't change the type");
      return;
    }
    onChanged({ flow, original_flow: imported, flow_manual: 1 });
    setOffer(flow);
    setKeyword(suggestTypeKeyword(tx.description));
    setPreview(null);
  };

  const reset = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/transactions/type?transaction_id=${tx.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't reset the type");
      return;
    }
    setOffer(null);
    // The server may have applied a type rule; the page re-reads the row.
    onChanged({ flow: imported, original_flow: null, flow_manual: 0 });
  };

  const addRule = async () => {
    if (!offer || !keyword.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/type-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: keyword.trim(), flow: offer }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't add the rule");
      return;
    }
    setRuleAdded(
      `Rule added — ${data.typed} other transaction${data.typed === 1 ? "" : "s"} re-typed now; future imports follow it too.`
    );
    setOffer(null);
    onChanged({ flow: tx.flow, original_flow: tx.original_flow, flow_manual: tx.flow_manual });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className={labelClass}>Type</span>
        <select
          className={selectClass}
          value={tx.flow}
          disabled={saving}
          onChange={(e) => setType(e.target.value as Flow)}
          aria-label="Transaction type"
        >
          {FLOWS.map((f) => (
            <option key={f} value={f}>
              {FLOW_LABELS[f]}
            </option>
          ))}
        </select>
        {tx.flow_manual ? (
          <>
            <span className="font-mono text-xs text-muted-foreground" title="Type set by hand">
              ✱ SET BY HAND
            </span>
            <button onClick={reset} disabled={saving} className={linkClass}>
              RESET TYPE
            </button>
          </>
        ) : tx.original_flow ? (
          <span className="font-mono text-xs text-muted-foreground">
            BY TYPE RULE · imported as {FLOW_LABELS[imported]}
          </span>
        ) : null}
      </div>

      {offer && (
        <div className="border p-3 space-y-2">
          <p className="text-xs">
            Always treat transactions containing this text as{" "}
            <span className="font-mono uppercase">{FLOW_LABELS[offer]}</span>?
          </p>
          <input
            className={`${selectClass} w-full`}
            value={keyword}
            maxLength={100}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="Type rule keyword"
          />
          <p className="text-[11px] text-muted-foreground">
            Include the direction (&quot;… to&quot; / &quot;… from&quot;) when the bank writes it, so
            money coming the other way isn&apos;t caught.
          </p>
          {preview && keyword.trim() && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Matches {preview.count} transaction{preview.count === 1 ? "" : "s"}
                {preview.manual > 0 && ` (${preview.manual} set by hand — left as is)`}
              </p>
              <div className="border divide-y divide-border">
                {preview.samples.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                    <span className="font-mono text-muted-foreground shrink-0">{s.txn_date}</span>
                    <span className="truncate flex-1 min-w-0">{s.description}</span>
                    <span className="font-mono text-muted-foreground shrink-0 uppercase">
                      {FLOW_LABELS[s.flow]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={addRule}
              disabled={saving || !keyword.trim()}
              className="inline-flex items-center px-3 py-1 border border-foreground font-mono text-xs tracking-widest uppercase hover:bg-foreground hover:text-background transition-colors disabled:opacity-50"
            >
              ADD TYPE RULE
            </button>
            <button onClick={() => setOffer(null)} className={linkClass}>
              JUST THIS ONE
            </button>
          </div>
        </div>
      )}

      {ruleAdded && <p className="text-xs text-muted-foreground">{ruleAdded}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
