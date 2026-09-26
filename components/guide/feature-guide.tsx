"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Brain,
  ChevronRight,
  CircleAlert,
  FileText,
  Import,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Repeat,
  Rocket,
  ShieldCheck,
  Smartphone,
  Store,
  Tag,
  Target,
  Upload,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import type { FeatureSection } from "@/lib/feature-guide";

// In-app feature guide: a bento grid of feature cards, each opening a side panel
// with that section of docs/FEATURES.md. Section HTML is trusted, repo-authored
// markdown rendered server-side by lib/feature-guide.ts.
//
// The panel is a plain in-page element, not a portalled base-ui Dialog, so every
// section is server-rendered into the DOM (hidden until picked) — deep links,
// find-in-page and the offline SW cache all see the full text.

// Icons mirror the sidebar where a feature has its own page; keyed by the
// section slug (= the heading's anchor). Unknown slugs fall back to the book.
const ICONS: Record<string, LucideIcon> = {
  "first-steps": Rocket,
  "importing-your-data": Upload,
  "switching-from-another-app": Import,
  dashboard: LayoutDashboard,
  "safe-to-spend": ShieldCheck,
  insights: Lightbulb,
  transactions: ArrowLeftRight,
  "categories-and-rules": Tag,
  "budget-goals": Target,
  "recurring-charges": Repeat,
  merchants: Store,
  "net-worth": Landmark,
  "ask-claude": Brain,
  "your-profile-and-data": User,
  "phone-app-and-notifications": Smartphone,
  "supported-banks": FileText,
  limitations: CircleAlert,
};

const labelClass = "font-mono text-[10px] tracking-widest uppercase text-muted-foreground";

export function FeatureGuide({ sections }: { sections: FeatureSection[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const slugs = useRef(new Set(sections.map((s) => s.slug)));

  const show = useCallback((slug: string | null) => {
    setOpen(slug);
    // The hash mirrors the open card so a panel is linkable and a reload
    // reopens it. replaceState: opening cards shouldn't pile up history.
    const url = slug ? `#${slug}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
  }, []);

  // Deep link: /guide#net-worth opens that card on load.
  useEffect(() => {
    const slug = decodeURIComponent(window.location.hash.slice(1));
    if (slugs.current.has(slug)) setOpen(slug);
  }, []);

  // On open: focus the close button, reset the panel's scroll (switching cards
  // via an in-text link would otherwise land mid-section). On close: hand focus
  // back to the card that opened it.
  useEffect(() => {
    if (open) {
      bodyRef.current?.scrollTo({ top: 0 });
      closeRef.current?.focus();
    } else {
      returnFocus.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") show(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, show]);

  // "[Insights](#insights)" inside a section switches the panel to that card
  // instead of jumping to an anchor that isn't on screen.
  const onPanelClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (href?.startsWith("#") && slugs.current.has(href.slice(1))) {
      e.preventDefault();
      show(href.slice(1));
    }
  };

  const current = sections.find((s) => s.slug === open) ?? null;
  const index = current ? sections.indexOf(current) : -1;
  const next = index >= 0 ? sections[index + 1] : undefined;

  return (
    <>
      {/* The 1px "borders" are the grid's bg-border showing through gap-px, so a
          card's hover fill must be OPAQUE (bg-muted) — a translucent one
          (bg-accent/50) lets the near-black border colour wash the whole tile. */}
      <div className="grid gap-px bg-border border border-border sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s, i) => {
          const Icon = ICONS[s.slug] ?? BookOpen;
          return (
            <button
              key={s.slug}
              type="button"
              onClick={(e) => {
                returnFocus.current = e.currentTarget;
                show(s.slug);
              }}
              aria-haspopup="dialog"
              className="group bg-card p-4 md:p-5 text-left flex flex-col gap-3 hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
            >
              <div className="flex items-center justify-between">
                <Icon className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className={labelClass}>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div>
                <h2 className="font-mono text-sm font-bold tracking-widest uppercase">{s.title}</h2>
                {s.summary && (
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{s.summary}</p>
                )}
              </div>
              <span className={`${labelClass} mt-auto inline-flex items-center gap-1 group-hover:text-foreground transition-colors`}>
                Open <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Backdrop + side panel. z-50 clears the phone tab bar (z-40). */}
      <div
        aria-hidden
        onClick={() => show(null)}
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${
          current ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={current ? `guide-title-${current.slug}` : undefined}
        hidden={!current}
        className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-xl bg-background border-l border-border flex flex-col pt-[env(safe-area-inset-top)]"
      >
        <div className="shrink-0 flex items-center justify-between gap-3 h-14 px-4 md:px-6 border-b border-border">
          <span className={labelClass}>
            Guide{index >= 0 && ` · ${String(index + 1).padStart(2, "0")} / ${sections.length}`}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => show(null)}
            aria-label="Close"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          ref={bodyRef}
          onClick={onPanelClick}
          className="flex-1 overflow-y-auto px-4 md:px-6 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          {sections.map((s) => {
            const Icon = ICONS[s.slug] ?? BookOpen;
            return (
              <section key={s.slug} hidden={s.slug !== open}>
                <div className="flex items-center gap-3">
                  <Icon className="size-5 shrink-0" />
                  <h2
                    id={`guide-title-${s.slug}`}
                    className="font-mono text-xl font-bold tracking-tight uppercase"
                  >
                    {s.title}
                  </h2>
                </div>
                <div className="prose-pare mt-4" dangerouslySetInnerHTML={{ __html: s.html }} />
                {s.advancedHtml && (
                  // Keyed per section so switching cards re-collapses it.
                  <details key={s.slug} className="group mt-8 border border-border bg-card">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted transition-colors">
                      <span className="font-mono text-xs font-bold tracking-widest uppercase">
                        Advanced
                      </span>
                      <span
                        aria-hidden
                        className="text-muted-foreground transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <div
                      className="prose-pare px-4 pb-4"
                      dangerouslySetInnerHTML={{ __html: s.advancedHtml }}
                    />
                  </details>
                )}
              </section>
            );
          })}

          {next && (
            <button
              type="button"
              onClick={() => show(next.slug)}
              className="mt-10 w-full flex items-center justify-between gap-3 border border-border px-4 py-3 text-left hover:bg-muted transition-colors"
            >
              <span>
                <span className={`${labelClass} block`}>Next</span>
                <span className="font-mono text-xs font-bold tracking-widest uppercase">
                  {next.title}
                </span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
