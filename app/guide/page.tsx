import type { Metadata } from "next";
import { FeatureGuide } from "@/components/guide/feature-guide";
import { parseFeatureGuide } from "@/lib/feature-guide";
import { FEATURES_MARKDOWN } from "@/lib/features-content.generated";

// In-app feature guide (sidebar → GUIDE): the same docs/FEATURES.md as the public
// /features article, shown as feature cards that open a side panel. Gated like
// every app page. Edit the markdown, never copy here — see lib/feature-guide.ts.

export const metadata: Metadata = {
  title: "Guide — PARE",
};

export default function GuidePage() {
  const { introHtml, sections } = parseFeatureGuide(FEATURES_MARKDOWN);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 max-w-2xl">
        <h1 className="font-mono text-2xl font-bold tracking-tight uppercase">GUIDE</h1>
        <div
          className="prose-pare mt-3 text-sm [&_p]:text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      </div>
      <FeatureGuide sections={sections} />
    </div>
  );
}
