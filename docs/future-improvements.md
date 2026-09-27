# Future improvements

Known shortcomings, tracked in one place so they aren't rediscovered piecemeal.
Each entry says what's missing, why it matters, and a sketch of the fix. When an
item ships, delete it here (the PR / CHANGELOG is the record).

Deliberate design decisions are NOT listed as shortcomings — e.g. properties
staying out of Income/Cashflow/Forecast is a closed decision (see the
`/properties` entry in CLAUDE.md), not a pending gap.

---

## 1. No cash total across accounts

**Gap.** There is no "how much cash do I have" figure. The Net Worth tab's
BALANCES card lists each account separately and mixes deposit accounts with
investments, manual entries, and property values; nothing sums just the
chequing + savings balances.

**Related:** the cash-flow forecast (and the SAFE TO SPEND hero derived from it)
anchors on the SINGLE most recent `chequing` statement
(`lib/db/cashflowForecast.ts`), not the sum of chequing accounts. With two
chequing accounts, whichever was uploaded last drives the whole projection, and
savings accounts never contribute.

**Sketch.** A CASH stat on the Net Worth tab = sum of the latest closing balance
per deposit-kind account (`isDepositKind`, excluding hidden/closed via
`account_meta`). Then decide whether the
forecast anchor should become that multi-account sum (needs per-account
staleness handling — anchors from different statement dates don't add cleanly).

## 2. Currency follow-ups

The single-currency setting shipped (`user_settings.currency`, migration 017;
`lib/currency.ts`; picked at self-host signup, changed in /profile; CAD and USD
only). Still open:

- **No mismatch warning on import.** OFX `CURDEF` and SimpleFIN's per-account
  `currency` are read but ignored, so a USD file imported into a CAD profile is
  added in silently. Warn (don't block) when they disagree with the setting.
- **Hosted signup has no picker.** Hosted sign-up waits for email verification
  before a session exists, so the currency can only be set in /profile
  afterwards (defaults to CAD). A first-dashboard-visit prompt would close this.
- **Hand-written `$`.** `formatK` and a few inline labels print a literal `$`.
  That is correct for CAD and USD; a non-dollar currency would need them routed
  through `formatMoney`.

## 3. Properties are only partially tracked

Phases 1, 2 and 4 shipped (standalone CRUD, Net Worth integration, the
losing-rental insight). Remaining gaps:

- **No MCP tools.** Every other domain has read/write tools in `mcp/`;
  properties have none, so Claude can't read or update them.
- **No hide/close for properties.** Statement accounts can be hidden or closed
  via `account_meta`; properties have no equivalent, so every property with data
  always shows in Net Worth (including one that has been sold).
- **Mortgage balance is a manual snapshot.** It is not auto-amortized, so the
  Net Worth liability goes stale unless the user edits it. An optional
  "project balance from the amortization schedule" would keep the trend honest.
- **WIPE on hosted.** `/api/data` WIPE (which clears property records) is
  self-host only; hosted has no wipe path yet (shared with all other data).
- **Unable to link transactions to properties.** Transactions are not linked to
  properties. Can't link a mortgage payment to a property.

## 4. Bank-account spending never reaches the spend charts

**Gap.** Overview, By Category, goals, insights, top merchants and the heatmap
count only card + cash accounts (`SPEND_WHERE` in `lib/db/account-kinds.ts`).
Debit purchases and Zelle payments from a chequing/savings account — the main
way many US users spend — are invisible there, even when typed as spend (they
still count in Cashflow / Income net / Forecast).

**Sketch.** A per-account "include this account's spending in spend charts"
setting in the profile MANAGE dialog (`account_meta`), on for accounts like
BoA checking, off for CIBC chequing so existing numbers don't move. Card-bill
payments are their own type (`payment`), so they don't double count; the one
real risk is a purchase recorded both as a bank debit and as manual cash.

## 5. Transaction-type follow-ups

- **No stored direction.** Amounts are magnitudes; a `transfer` row doesn't
  record whether money went in or out, so type rules rely on the bank writing
  the direction ("Zelle payment to" / "from"). Banks that print the same text
  both ways (e.g. "INTERNET TRANSFER 000123") can only be fixed per row. A
  `direction` column set at import (every importer knows the sign) would let a
  rule be scoped to money out.
- **Type rules aren't in the JSON export / rules import**, and there are no MCP
  tools to read or set types yet.


## 6. Transactions filter dropdowns show raw values when closed

The category / source / tag filters on `/transactions` display the internal
value in the closed trigger (`all`, `boa_chequing`) instead of the option label
("ALL CATEGORIES", "BOA CHEQUING"): base-ui's `Select.Value` can only show a
label it has been given, and the labels live in the unmounted popup. Fix: pass
each `<Select>` an `items` value→label map, as the TYPE filter already does.
Low priority — cosmetic only.

## 7. Investments are balance-only (net worth)

`/investments` (migration 016) tracks a dated balance per account and feeds Net
Worth only. Known gaps:

- **Brokerage/retirement accounts synced via SimpleFIN/OFX leak into income.**
  Every income query (`income.ts`, `cashflow.ts`, `forecast.ts`,
  `cashflowForecast.ts`) is `WHERE flow = 'income'` with no `account_kind`
  filter, so dividends/contributions on an `investment`-kind account count as
  income. Fix: one shared `INCOME_WHERE` (next to `SPEND_WHERE`) that excludes
  `investment`. Until then, track these accounts on `/investments` by hand.
- **Recurring contributions aren't in the cash-flow forecast.** An automatic
  chequing→IRA/brokerage transfer stays `Banking`-categorised, so it's in
  neither the fixed nor variable bucket and the projected balance drifts high
  (same for automatic savings sweeps).
- **No contribution vs growth split** — the history is balances only.
- **No MCP tools** for investments.
- **Synced balances don't feed the history.** An `investment`-kind statement
  anchor still shows as its own statement line in net worth, separate from
  any `/investments` account.
