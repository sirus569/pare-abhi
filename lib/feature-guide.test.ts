import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeatureGuide } from "./feature-guide";
import { FEATURES_MARKDOWN } from "./features-content.generated";

const SAMPLE = [
  "# Guide",
  "",
  "Intro text.",
  "",
  "## What Pare can do",
  "",
  "| Feature | In one line |",
  "|---|---|",
  "| [Alpha](#alpha) | First thing. |",
  "| [Beta two](#beta-two) | Second thing. |",
  "",
  "## Alpha",
  "",
  "Alpha body. See [Beta two](#beta-two).",
  "",
  "### Advanced",
  "",
  "- Alpha extra",
  "",
  "## Beta two",
  "",
  "Beta body.",
].join("\n");

test("parseFeatureGuide: overview table becomes summaries, not a card", () => {
  const { introHtml, sections } = parseFeatureGuide(SAMPLE);
  assert.match(introHtml, /Intro text/);
  assert.doesNotMatch(introHtml, /<h1/);
  assert.deepEqual(
    sections.map((s) => [s.slug, s.title, s.summary]),
    [
      ["alpha", "Alpha", "First thing."],
      ["beta-two", "Beta two", "Second thing."],
    ]
  );
});

test("parseFeatureGuide: ### Advanced splits into its own block", () => {
  const [alpha, beta] = parseFeatureGuide(SAMPLE).sections;
  assert.match(alpha.html, /Alpha body/);
  assert.doesNotMatch(alpha.html, /Advanced|Alpha extra/);
  assert.match(alpha.advancedHtml ?? "", /Alpha extra/);
  assert.equal(beta.advancedHtml, null);
});

test("real guide: every card has a summary and every #link targets a card", () => {
  const { sections } = parseFeatureGuide(FEATURES_MARKDOWN);
  assert.ok(sections.length >= 10);
  const slugs = new Set(sections.map((s) => s.slug));
  for (const s of sections) {
    assert.ok(s.summary, `card "${s.title}" has no row in the What Pare can do table`);
    for (const html of [s.html, s.advancedHtml ?? ""]) {
      for (const m of html.matchAll(/href="#([^"]+)"/g)) {
        // heading self-anchors (#advanced) are stripped with the heading; any
        // remaining in-page link must switch to a real card.
        assert.ok(slugs.has(m[1]), `"${s.title}" links to #${m[1]}, which is not a card`);
      }
    }
  }
});
