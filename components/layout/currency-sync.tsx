"use client";

import { useEffect } from "react";
import { isCurrency } from "@/lib/currency";
import { getDisplayCurrency, setDisplayCurrency } from "@/lib/format";

// Confirms the client formatter's display currency against the server setting
// (GET /api/settings) once per app-chrome mount. lib/format seeds the value
// from localStorage at module load so the first paint is already right on a
// returning device; this only corrects a stale or empty cache (new device,
// cleared storage, currency changed elsewhere). Mounted inside the Sidebar's
// signed-in branch, so public pages never probe the gated route.
//
// A correction does NOT force a re-render of figures already painted — for the
// supported CAD/USD pair both format as a bare "$", so the text is identical;
// the next render (navigation, refetch) picks up the new value either way.
export function CurrencySync() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !isCurrency(d?.currency)) return;
        if (d.currency !== getDisplayCurrency()) setDisplayCurrency(d.currency);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
