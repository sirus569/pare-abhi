import type { Metadata } from "next";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/site-chrome";
import { BlogTocRail } from "@/components/blog/blog-toc-rail";
import { renderDocument } from "@/lib/blog";
import { FEATURES_MARKDOWN } from "@/lib/features-content.generated";

// Public feature guide. The content is docs/FEATURES.md — ONE source for the repo
// (GitHub renders it) and this page — bundled by scripts/gen-blog-content.mjs into
// lib/features-content.generated.ts (no runtime fs: the page must render inside a
// Cloudflare Worker too). Edit the markdown, never this page's copy. Authoring
// rules that keep both renderings working: no frontmatter, and no relative links
// (in-app screens are bold text; other docs are absolute URLs).
//
// Readable signed-out: middleware PUBLIC_PATHS + WAITLIST_PUBLIC, the Sidebar's
// full-screen list, and app/sitemap.ts all list /features.

export const metadata: Metadata = {
  title: "Feature guide — PARE",
  description:
    "Everything Pare does, feature by feature: importing statements, the dashboard, forecasts, budgets, subscriptions, net worth, and asking Claude about your money.",
  alternates: { canonical: "https://pare.money/features" },
};

const labelClass = "font-mono text-[10px] tracking-widest uppercase text-muted-foreground";

export default function FeaturesPage() {
  const { html, toc } = renderDocument(FEATURES_MARKDOWN);
  const h2s = toc.filter((t) => t.depth === 2);

  return (
    <div className="min-h-full flex flex-col bg-background">
      <MarketingHeader />

      {/* Same layout as a blog post: on xl the TOC is a sticky scroll-spy column
          in the left gutter; below xl an inline TOC box sits above the guide. */}
      <div className="flex-1 w-full xl:flex xl:justify-center xl:gap-10">
        <aside className="hidden xl:block w-52 shrink-0 pt-10">
          <div className="sticky top-24">
            <BlogTocRail items={h2s.map((t) => ({ id: t.id, text: t.text }))} />
          </div>
        </aside>
        <main className="w-full max-w-2xl mx-auto xl:mx-0 px-5 md:px-8 py-10">
          <p className={labelClass}>Guide</p>
          <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight mt-2 leading-tight">
            Pare feature guide
          </h1>

          <nav aria-label="On this page" className="mt-8 border border-border bg-card p-4 xl:hidden">
            <p className={`${labelClass} mb-2`}>On this page</p>
            <ul className="space-y-1.5">
              {h2s.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    {t.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Trusted, repo-authored markdown rendered by lib/blog.ts — same
              dangerouslySetInnerHTML contract as blog posts. */}
          <article className="mt-8 prose-pare" dangerouslySetInnerHTML={{ __html: html }} />
        </main>
      </div>

      <MarketingFooter current="/features" />
    </div>
  );
}
