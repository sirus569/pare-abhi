import { renderMarkdown, slugify } from "./blog";

// Slices docs/FEATURES.md into per-feature cards for the in-app /guide page.
// Pure (no fs, no React) — the page calls it on the bundled FEATURES_MARKDOWN.
// The public /features page renders the same markdown as one long article
// (renderDocument); this is the other view of the same source.
//
// Relies on the guide's shape (see the authoring notes in CLAUDE.md):
//   # Title                  → dropped (the page has its own H1)
//   intro paragraphs         → introHtml
//   ## What Pare can do      → NOT a card; its table's `| [Title](#slug) | summary |`
//                              rows supply each card's one-line summary
//   ## <Feature>             → one card, in document order
//   ### Advanced             → optional; everything after it is the card's
//                              collapsible Advanced block

export interface FeatureSection {
  slug: string; // same id GitHub + /features give the heading, so #anchors carry over
  title: string;
  summary: string;
  html: string;
  advancedHtml: string | null;
}

export interface FeatureGuide {
  introHtml: string;
  sections: FeatureSection[];
}

const OVERVIEW_SLUG = "what-pare-can-do";
const SUMMARY_ROW = /^\|\s*\[[^\]]+\]\(#([a-z0-9-]+)\)\s*\|\s*(.+?)\s*\|\s*$/gm;
const ADVANCED = /^###\s+Advanced\s*$/m;

export function parseFeatureGuide(markdown: string): FeatureGuide {
  const body = markdown.replace(/^\s*# .*\r?\n/, "");
  const [intro, ...chunks] = body.split(/^## /m);

  const summaries = new Map<string, string>();
  const sections: FeatureSection[] = [];

  for (const chunk of chunks) {
    const newline = chunk.indexOf("\n");
    const title = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
    const content = newline === -1 ? "" : chunk.slice(newline + 1);
    const slug = slugify(title);

    if (slug === OVERVIEW_SLUG) {
      for (const m of content.matchAll(SUMMARY_ROW)) summaries.set(m[1], m[2]);
      continue;
    }

    const split = content.search(ADVANCED);
    const main = split === -1 ? content : content.slice(0, split);
    const advanced = split === -1 ? "" : content.slice(split).replace(ADVANCED, "");
    sections.push({
      slug,
      title,
      summary: "",
      html: renderMarkdown(main),
      advancedHtml: advanced.trim() ? renderMarkdown(advanced) : null,
    });
  }

  for (const s of sections) s.summary = summaries.get(s.slug) ?? "";
  return { introHtml: renderMarkdown(intro), sections };
}
