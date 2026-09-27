"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, CURRENCY_LABELS, isCurrency, type Currency } from "@/lib/currency";
import { getDisplayCurrency, setDisplayCurrency } from "@/lib/format";

// /profile CURRENCY card: the one currency every amount is assumed to be in
// (lib/currency.ts, /api/settings). Changing it relabels figures only — stored
// amounts are never converted.
export function CurrencyCard({ labelClass }: { labelClass: string }) {
  const [currency, setCurrency] = useState<Currency>(getDisplayCurrency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (isCurrency(d?.currency)) setCurrency(d.currency);
      })
      .catch(() => {});
  }, []);

  const save = async (next: Currency) => {
    const prev = currency;
    setCurrency(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: next }),
      });
      if (!res.ok) throw new Error();
      setDisplayCurrency(next);
    } catch {
      setCurrency(prev);
      setError("Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-none ring-0 border border-border py-0 gap-0">
      <div className="px-4 pt-4">
        <span className={labelClass}>Currency</span>
      </div>
      <div className="px-4 pt-2 pb-4">
        <Select
          value={currency}
          onValueChange={(v) => v && v !== currency && save(v as Currency)}
          disabled={busy}
        >
          <SelectTrigger className="w-full rounded-none font-mono text-xs">
            <SelectValue>{(v: Currency) => CURRENCY_LABELS[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c} className="font-mono text-xs">
                {CURRENCY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-2">
          All accounts are treated as this one currency. Changing it relabels
          amounts; Pare never converts between currencies.
        </p>
        {error && <p className="font-mono text-[11px] text-destructive mt-1">{error}</p>}
      </div>
    </Card>
  );
}
