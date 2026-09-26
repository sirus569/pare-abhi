import { test, expect } from "@playwright/test";
import path from "path";
import { FIXTURES, wipeData } from "./helpers";

// The upload journey is the ONE place we drive ingestion through the UI —
// every other spec seeds through the API (helpers.seedCardData) because the
// journey only needs testing once. OFX fixtures, not PDFs: the OFX path is
// pure TS (deterministic, no poppler dependency); PDF parsing has its own
// Python regression suite (npm test).

test.beforeEach(async ({ request }) => {
  await wipeData(request);
});

test("uploading an OFX statement parses it and lights up transactions", async ({
  page,
}) => {
  await page.goto("/upload");

  // The file input is visually hidden behind the BROWSE FILES label —
  // setInputFiles targets the input directly and doesn't need visibility.
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(FIXTURES, "card-statement.qfx"));

  // Upload fires on change; the RESULTS card renders when /api/upload responds.
  await expect(page.getByText("13 transactions parsed")).toBeVisible();
  await expect(page.getByText("13 inserted")).toBeVisible();

  // Both wire formats: OFX 1.x SGML chequing on top of the QFX card file.
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(FIXTURES, "chequing-statement.ofx"));
  await expect(page.getByText("5 transactions parsed")).toBeVisible();

  // The imported rows are queryable, categorized (recategorizeAll ran), and
  // carry the ofx_* source derived from the account block.
  await page.goto("/transactions");
  await page.getByPlaceholder("Search descriptions...").fill("NETFLIX");
  const row = page.getByRole("row", { name: /NETFLIX\.COM/ }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Subscriptions");
  await expect(row).toContainText("ofx_card_4444");
});

test("re-uploading the same file dedups on FITID instead of doubling data", async ({
  page,
}) => {
  await page.goto("/upload");
  const input = page.locator('input[type="file"]');

  await input.setInputFiles(path.join(FIXTURES, "card-statement.qfx"));
  await expect(page.getByText("13 inserted")).toBeVisible();

  await input.setInputFiles(path.join(FIXTURES, "card-statement.qfx"));
  // Second RESULTS card: nothing inserted, everything skipped as a duplicate.
  await expect(page.getByText("0 inserted")).toBeVisible();
  await expect(page.getByText("13 duplicates skipped")).toBeVisible();
});

test("a Bank of America CSV is auto-detected, imports, and dedups", async ({ page }) => {
  await page.goto("/upload");
  const input = page.locator('input[type="file"]');
  // BoA names every download stmt.csv — the fixture keeps that real-world name.
  const boa = path.join(FIXTURES, "boa", "stmt.csv");

  await input.setInputFiles(boa);
  await expect(page.getByText("looks like a Bank of America export")).toBeVisible();
  await expect(page.getByText("8 transactions ·")).toBeVisible(); // live preview
  await page.getByRole("button", { name: "Import 8 transactions" }).click();
  await expect(page.getByText("8 transactions parsed")).toBeVisible();
  await expect(page.getByText("8 inserted")).toBeVisible();

  await input.setInputFiles(boa);
  await page.getByRole("button", { name: "Import 8 transactions" }).click();
  await expect(page.getByText("8 duplicates skipped")).toBeVisible();

  await page.goto("/transactions");
  await page.getByPlaceholder("Search descriptions...").fill("CORNER CAFE");
  const row = page.getByRole("row", { name: /CORNER CAFE/ }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("boa_chequing");
});

test("an unknown bank's CSV imports through Other institution", async ({ page }) => {
  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "other-bank.csv"));

  // Not a known profile → Other; the mapping is pre-filled, a name is required.
  await expect(page.getByText("Give the account a name.")).toBeVisible();
  await page.getByPlaceholder("e.g. Everyday Chequing").fill("Everyday");
  await expect(page.getByText("3 transactions ·")).toBeVisible();
  await page.getByRole("button", { name: "Import 3 transactions" }).click();
  await expect(page.getByText("3 inserted")).toBeVisible();

  await page.goto("/transactions");
  await page.getByPlaceholder("Search descriptions...").fill("GROCERY MART");
  await expect(page.getByRole("row", { name: /GROCERY MART/ }).first()).toContainText(
    "csv_everyday_chequing"
  );
});
