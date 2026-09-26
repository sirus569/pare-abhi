"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FLOWS, FLOW_LABELS, type Flow, type TypeRule } from "@/lib/transaction-types";

// TYPE RULES on /categories: keyword → transaction type (spend / income /
// transfer / card payment / fee), first match wins, applied before category
// rules. A live preview shows what a keyword catches before it's saved.

const inputClass =
  "border border-border bg-background font-mono text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-foreground";

interface Preview {
  count: number;
  manual: number;
  samples: { id: number; txn_date: string; description: string; flow: Flow }[];
}

export function TypeRulesCard() {
  const [rules, setRules] = useState<TypeRule[]>([]);
  const [keyword, setKeyword] = useState("");
  const [flow, setFlow] = useState<Flow>("spend");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      fetch("/api/type-rules")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setRules(d.rules)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const kw = keyword.trim();
    if (!kw) return;
    const t = setTimeout(() => {
      fetch(`/api/type-rules?preview=${encodeURIComponent(kw)}`)
        .then((r) => r.json())
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [keyword]);

  const add = async () => {
    if (!keyword.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/type-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: keyword.trim(), flow }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't add the rule");
      return;
    }
    setMessage(
      `Added — ${data.typed} transaction${data.typed === 1 ? "" : "s"} re-typed now; future imports follow it too.`
    );
    setKeyword("");
    setPreview(null);
    load();
  };

  const remove = async (rule: TypeRule) => {
    const res = await fetch(`/api/type-rules?id=${rule.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(`Removed "${rule.keyword}" — ${data.typed} transaction${data.typed === 1 ? "" : "s"} re-typed.`);
      load();
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="py-4 space-y-3">
        <div>
          <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
            TYPE RULES
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Set what kind of money movement a transaction is — e.g. &quot;Zelle payment to&quot; →
            Spend. Applied before category rules; types you set by hand are never changed.
          </p>
        </div>

        {rules.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rules.map((rule) => (
              <span
                key={rule.id}
                className="inline-flex items-center gap-1 px-2 py-1 border text-xs font-mono group"
              >
                {rule.keyword}
                <span className="text-muted-foreground"> → {FLOW_LABELS[rule.flow].toUpperCase()}</span>
                <button
                  onClick={() => remove(rule)}
                  aria-label={`Delete type rule ${rule.keyword}`}
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 ml-1 px-2.5 py-2 -my-2 -mr-2.5 text-muted-foreground hover:text-foreground transition-opacity"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className={`${inputClass} flex-1`}
            placeholder='Keyword, e.g. "Zelle payment to"'
            value={keyword}
            maxLength={100}
            onChange={(e) => {
              setKeyword(e.target.value);
              setMessage(null);
              if (!e.target.value.trim()) setPreview(null);
            }}
            aria-label="Type rule keyword"
          />
          <select
            className={inputClass}
            value={flow}
            onChange={(e) => setFlow(e.target.value as Flow)}
            aria-label="Type"
          >
            {FLOWS.map((f) => (
              <option key={f} value={f}>
                {FLOW_LABELS[f]}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={saving || !keyword.trim()}
            className="inline-flex items-center justify-center px-3 py-1 border border-foreground font-mono text-xs tracking-widest uppercase hover:bg-foreground hover:text-background transition-colors disabled:opacity-50"
          >
            ADD TYPE RULE
          </button>
        </div>

        {preview && keyword.trim() && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              Matches {preview.count} transaction{preview.count === 1 ? "" : "s"}
              {preview.manual > 0 && ` (${preview.manual} set by hand — left as is)`}. Include the
              direction (&quot;… to&quot; / &quot;… from&quot;) if incoming money shows up here.
            </p>
            {preview.samples.length > 0 && (
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
            )}
          </div>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
