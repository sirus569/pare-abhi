import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBankCsv,
  suggestMapping,
  suggestInvert,
  detectProfile,
  cleanBoaDescription,
  classifyCsvRow,
  toRows,
  parseMoney,
  parseDate,
  inferDateOrder,
  slugifyAccountName,
  type CsvMapping,
  type CsvParseSuccess,
} from "./index";
import { parseCsvImportOptions } from "./options";
import { SqliteRepo } from "../../repo/sqlite-repo";
import { DoBackend, MemoryDurableStore } from "../../repo/do-backend";
import { insertOfxImport } from "../../repo/insert-ofx";

// ---------------------------------------------------------------------------
// Synthetic fixtures only — no real data.
// ---------------------------------------------------------------------------

// Bank of America activity CSV: summary block, blank line, ledger with a leading
// "Beginning balance" row, quoted amounts with thousands separators, CRLF.
// Running balances reconcile (1,000.00 → … → 3,176.90).
const BOA = [
  "Description,,Summary Amt.",
  'Beginning balance as of 01/01/2026,,"1,000.00"',
  'Total credits,,"2,500.25"',
  'Total debits,,"-323.35"',
  'Ending balance as of 01/31/2026,,"3,176.90"',
  "",
  "Date,Description,Amount,Running Bal.",
  '01/01/2026,Beginning balance as of 01/01/2026,,"1,000.00"',
  '01/02/2026,"EXAMPLE CORP DES:PAYROLL ID:XXXXX12345 INDN:JANE DOE CO ID:XXXXX99999 PPD","2,500.00","3,500.00"',
  '01/03/2026,"APPLECARD GSBANK DES:PAYMENT ID:0000111 INDN:JANE DOE CO ID:9999 WEB","-200.00","3,300.00"',
  '01/05/2026,"Zelle payment to SAMPLE PERSON Conf# abc123","-75.00","3,225.00"',
  '01/05/2026,"CHECKCARD 0104 CORNER CAFE, ANYTOWN ST 24445006004000000000001","-4.50","3,220.50"',
  '01/05/2026,"CHECKCARD 0104 CORNER CAFE, ANYTOWN ST 24445006004000000000001","-4.50","3,216.00"',
  '01/20/2026,"UTILITY CO DES:PAYMENT ID:77 INDN:JANE DOE CO ID:88 WEB","-27.35","3,188.65"',
  '01/28/2026,"Monthly Maintenance Fee","-12.00","3,176.65"',
  '01/31/2026,"Interest Earned","0.25","3,176.90"',
].join("\r\n");

const boa = (text = BOA, kind: "chequing" | "savings" = "chequing") => {
  const r = parseBankCsv(text, { institution: "boa", kind });
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r as CsvParseSuccess;
};

// Newest-first, DD/MM dates, Debit/Credit columns + Balance (a UK/CA-style export).
const DEBIT_CREDIT = [
  "Account activity export",
  "Transaction Date,Details,Debit,Credit,Balance",
  "28/01/2026,GROCERY MART,45.10,,854.90",
  "15/01/2026,PAYROLL DEPOSIT,,500.00,900.00",
  "03/01/2026,E-TRANSFER SENT SAMPLE PERSON,100.00,,400.00",
].join("\n");

// Headerless (TD-style): date, description, debit, credit, balance.
const HEADERLESS = [
  "05/01/2026,COFFEE SPOT,4.25,,995.75",
  "09/01/2026,PAY DEPOSIT,,1200.00,2195.75",
  "11/02/2026,HARDWARE STORE,60.00,,2135.75",
].join("\n");

// Card export printing charges POSITIVE (and the payment negative).
const CARD_POSITIVE = [
  "Date,Description,Amount",
  "2026-02-01,STREAMING SERVICE,15.99",
  "2026-02-03,BOOKSHOP,32.00",
  "2026-02-10,PAYMENT THANK YOU,-47.99",
].join("\n");

// ---------------------------------------------------------------------------
// Cell parsing
// ---------------------------------------------------------------------------

test("parseMoney handles separators, currency, parentheses, trailing minus", () => {
  assert.equal(parseMoney('1,234.56'), 1234.56);
  assert.equal(parseMoney("-$12.00"), -12);
  assert.equal(parseMoney("(12.00)"), -12);
  assert.equal(parseMoney("12.00-"), -12);
  assert.equal(parseMoney("USD 5"), 5);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("n/a"), null);
});

test("parseDate + inferDateOrder", () => {
  assert.equal(parseDate("03/04/2026", "mdy"), "2026-03-04");
  assert.equal(parseDate("03/04/2026", "dmy"), "2026-04-03");
  assert.equal(parseDate("2026-01-05", "dmy"), "2026-01-05");
  assert.equal(parseDate("Jan 5, 2026", "mdy"), "2026-01-05");
  assert.equal(parseDate("05-Jan-2026", "mdy"), "2026-01-05");
  assert.equal(parseDate("02/30/2026", "mdy"), null);
  assert.equal(inferDateOrder(["01/02/2026", "01/28/2026"]), "mdy");
  assert.equal(inferDateOrder(["28/01/2026", "01/02/2026"]), "dmy");
  assert.equal(inferDateOrder(["2026-01-28"]), "ymd");
  assert.equal(inferDateOrder(["01/02/2026", "03/04/2026"]), null, "all ambiguous → ask");
});

test("slugifyAccountName", () => {
  assert.equal(slugifyAccountName("  Joint Chequing!! "), "joint_chequing");
  assert.equal(slugifyAccountName("!!!"), "");
});

// ---------------------------------------------------------------------------
// Bank of America profile
// ---------------------------------------------------------------------------

test("BoA: detected by its full fingerprint; other layouts are not", () => {
  assert.equal(detectProfile(toRows(BOA)), "boa");
  assert.equal(detectProfile(toRows("﻿" + BOA)), "boa");
  assert.equal(detectProfile(toRows(DEBIT_CREDIT)), null);
  assert.equal(detectProfile(toRows(CARD_POSITIVE)), null);
});

test("BoA: strict match explains near-misses and points to Other", () => {
  const noSummary = BOA.split("\r\n").slice(6).join("\n");
  const r1 = parseBankCsv(noSummary, { institution: "boa", kind: "chequing" });
  assert.ok(!r1.ok && /Summary Amt\.|summary line/.test(r1.error) && /Other institution/.test(r1.error));

  const renamed = BOA.replace("Running Bal.", "Running Balance");
  const r2 = parseBankCsv(renamed, { institution: "boa", kind: "chequing" });
  assert.ok(!r2.ok && /Running Bal\./.test(r2.error));

  const mismatched = BOA.replace('01/01/2026,Beginning balance as of 01/01/2026,,"1,000.00"', '01/01/2026,Beginning balance as of 01/01/2026,,"999.00"');
  const r3 = parseBankCsv(mismatched, { institution: "boa", kind: "chequing" });
  assert.ok(!r3.ok && /opening balance/.test(r3.error));

  const card = parseBankCsv(BOA, { institution: "boa", kind: "card" });
  assert.ok(!card.ok);
});

test("BoA: summary balances, period, rows, sources", () => {
  const { parsed, unreconciled, skippedRows } = boa();
  assert.equal(unreconciled, 0);
  assert.equal(skippedRows, 0, "the amount-less Beginning balance row isn't a skip");
  const a = parsed.accounts[0];
  assert.equal(a.source, "boa_chequing");
  assert.equal(a.account, "BANK OF AMERICA CHECKING");
  assert.equal(a.closing_balance, 3176.9);
  assert.equal(a.closing_date, "2026-01-31");
  assert.equal(a.period, "2026-01-02 to 2026-01-31");
  assert.equal(a.transactions.length, 8);
  assert.ok(a.transactions.every((t) => t.amount > 0));
  assert.equal(boa(BOA, "savings").parsed.accounts[0].source, "boa_savings");
});

test("BoA: flows — payroll, card payment, zelle, debit, utility, fee, interest", () => {
  const flows = boa().parsed.accounts[0].transactions.map((t) => t.flow);
  assert.deepEqual(flows, [
    "income",
    "payment", // card bill — must not count as outflow on top of the card's purchases
    "transfer",
    "spend",
    "spend",
    "spend", // utility DES:PAYMENT without a card issuer stays real spend
    "fee_interest",
    "income",
  ]);
  assert.equal(classifyCsvRow("chequing", "BKOFAMERICA ATM 01/04 #000001 WITHDRWL", -60).flow, "transfer");
  assert.equal(classifyCsvRow("chequing", "Zelle payment from SAMPLE PERSON", 40).flow, "transfer");
});

test("BoA: description cleaning drops ids, the account-holder name, ref tails", () => {
  const txns = boa().parsed.accounts[0].transactions;
  assert.equal(txns[0].description, "EXAMPLE CORP DES:PAYROLL");
  assert.equal(txns[1].description, "APPLECARD GSBANK DES:PAYMENT");
  assert.equal(txns[2].description, "Zelle payment to SAMPLE PERSON");
  assert.equal(txns[3].description, "CORNER CAFE, ANYTOWN ST");
  assert.ok(txns.every((t) => !/JANE DOE/.test(t.description)));
  assert.equal(cleanBoaDescription("Interest Earned"), "Interest Earned");
});

test("same-day identical rows stay distinct; ids stable across overlapping files", () => {
  const txns = boa().parsed.accounts[0].transactions;
  const cafe = txns.filter((t) => t.description === "CORNER CAFE, ANYTOWN ST");
  assert.equal(cafe.length, 2);
  assert.notEqual(cafe[0].fitId, cafe[1].fitId);

  // Ids come from the RAW row, so the same file read via the Other path (no
  // BoA description cleaning) produces identical ids.
  const ids = new Set(txns.map((t) => t.fitId));
  const other = parseBankCsv(BOA, {
    institution: "other",
    kind: "chequing",
    accountName: "x",
    mapping: suggestMapping(toRows(BOA))!.mapping as CsvMapping,
  }) as CsvParseSuccess;
  assert.ok(other.parsed.accounts[0].transactions.every((t) => ids.has(t.fitId)), "same raw rows → same ids");
});

test("running-balance mismatches are counted, not fatal (no cascade)", () => {
  const { unreconciled, parsed } = boa(BOA.replace('"-75.00","3,225.00"', '"-70.00","3,225.00"'));
  assert.equal(unreconciled, 1);
  assert.equal(parsed.accounts[0].transactions.length, 8);
});

// ---------------------------------------------------------------------------
// Other institution: detection + mapping
// ---------------------------------------------------------------------------

test("Other: header detection with a preamble, debit/credit, DD/MM, newest-first", () => {
  const rows = toRows(DEBIT_CREDIT);
  const s = suggestMapping(rows)!;
  assert.equal(s.mapping.headerRow, 1);
  assert.deepEqual(
    [s.mapping.date, s.mapping.description, s.mapping.amount, s.mapping.debit, s.mapping.credit, s.mapping.balance],
    [0, 1, null, 2, 3, 4]
  );
  assert.equal(s.mapping.dateOrder, "dmy");
  assert.equal(s.columns[1], "Details");

  const r = parseBankCsv(rows, {
    institution: "other",
    kind: "chequing",
    accountName: "Joint Chequing",
    mapping: s.mapping as CsvMapping,
  }) as CsvParseSuccess;
  assert.ok(r.ok);
  const a = r.parsed.accounts[0];
  assert.equal(a.source, "csv_joint_chequing_chequing");
  assert.equal(a.account, "JOINT CHEQUING CHECKING");
  assert.equal(r.unreconciled, 0, "newest-first file reconciles in chronological order");
  assert.equal(a.closing_balance, 854.9, "latest balance chronologically, not the last line");
  assert.equal(a.closing_date, "2026-01-28");
  assert.deepEqual(a.transactions.map((t) => [t.txn_date, t.flow, t.amount]), [
    ["2026-01-03", "transfer", 100], // emitted chronologically
    ["2026-01-15", "income", 500],
    ["2026-01-28", "spend", 45.1],
  ]);
});

test("Other: headerless file guesses date/desc/debit/credit/balance", () => {
  const s = suggestMapping(toRows(HEADERLESS))!;
  assert.equal(s.mapping.headerRow, -1);
  assert.deepEqual(
    [s.mapping.date, s.mapping.description, s.mapping.debit, s.mapping.credit, s.mapping.balance],
    [0, 1, 2, 3, 4]
  );
  assert.equal(s.columns[0], "Column 1");
  assert.equal(s.mapping.dateOrder, null, "05/01, 09/01, 11/02 are ambiguous → user picks");
  const r = parseBankCsv(HEADERLESS, {
    institution: "other",
    kind: "chequing",
    accountName: "Everyday",
    mapping: { ...(s.mapping as CsvMapping), dateOrder: "mdy" },
  }) as CsvParseSuccess;
  assert.equal(r.unreconciled, 0);
  assert.equal(r.parsed.accounts[0].transactions.length, 3);
});

test("Other: a card export printing charges positive is flipped", () => {
  const rows = toRows(CARD_POSITIVE);
  const s = suggestMapping(rows)!;
  const mapping = { ...(s.mapping as CsvMapping) };
  assert.equal(suggestInvert(rows, mapping, "card"), true);
  assert.equal(suggestInvert(rows, mapping, "chequing"), false);
  mapping.invertSign = true;
  const r = parseBankCsv(rows, { institution: "other", kind: "card", accountName: "Travel Visa", mapping }) as CsvParseSuccess;
  const a = r.parsed.accounts[0];
  assert.equal(a.source, "csv_travel_visa_card");
  assert.equal(a.closing_balance, null, "card balances are never taken from a CSV");
  assert.deepEqual(a.transactions.map((t) => t.flow), ["spend", "spend", "payment"]);
});

test("Other: a running balance settles the sign on deposit accounts", () => {
  // Exports where withdrawals print positive: only the flipped sign reconciles.
  const flipped = [
    "Date,Description,Amount,Balance",
    "2026-03-01,RENT,1000.00,500.00",
    "2026-03-02,SALARY,-2000.00,2500.00",
  ].join("\n");
  const rows = toRows(flipped);
  const mapping = suggestMapping(rows)!.mapping as CsvMapping;
  mapping.dateOrder = "ymd";
  assert.equal(suggestInvert(rows, mapping, "chequing"), true);
});

test("Other: refuses bad options", () => {
  const rows = toRows(CARD_POSITIVE);
  const mapping = suggestMapping(rows)!.mapping as CsvMapping;
  const base = { institution: "other", kind: "card" as const, mapping };
  assert.ok(!parseBankCsv(rows, { ...base, accountName: "  " }).ok, "needs a name");
  assert.ok(!parseBankCsv(rows, { ...base, accountName: "x", mapping: { ...mapping, amount: 9 } }).ok);
  assert.ok(!parseBankCsv(rows, { ...base, accountName: "x", mapping: { ...mapping, amount: null } }).ok);
  assert.ok(!parseBankCsv(rows, { ...base, institution: "nope", accountName: "x" }).ok);
});

test("parseCsvImportOptions validates the untrusted form field", () => {
  assert.deepEqual(parseCsvImportOptions('{"institution":"boa","kind":"savings"}'), {
    institution: "boa",
    kind: "savings",
  });
  assert.equal(parseCsvImportOptions('{"institution":"boa","kind":"brokerage"}'), null);
  assert.equal(parseCsvImportOptions("not json"), null);
  assert.equal(parseCsvImportOptions(null), null);
});

// ---------------------------------------------------------------------------
// End to end through the repo (DoBackend = the hosted-path harness)
// ---------------------------------------------------------------------------

test("re-importing the same file (and an overlapping one) inserts nothing new", async () => {
  const backend = new DoBackend(new MemoryDurableStore());
  const repo = new SqliteRepo(backend);
  await backend.open();
  await repo.categories.seed();

  const first = await insertOfxImport(repo, "boa_chequing a.csv", boa().parsed);
  assert.equal(first.inserted, 8);

  const again = await insertOfxImport(repo, "boa_chequing a.csv", boa().parsed);
  assert.equal(again.inserted, 0);
  assert.equal(again.skipped, 8);

  // Overlapping download: a later window starting 01/05, still a valid BoA file.
  const lines = BOA.split("\r\n");
  const overlap = [
    ...lines.slice(0, 7).map((l) => l.replace("01/01/2026", "01/05/2026").replace('"1,000.00"', '"3,300.00"')),
    '01/05/2026,Beginning balance as of 01/05/2026,,"3,300.00"',
    ...lines.slice(10),
  ].join("\r\n");
  const third = await insertOfxImport(repo, "boa_chequing b.csv", boa(overlap).parsed);
  assert.equal(third.total, 6);
  assert.equal(third.inserted, 0);
});
