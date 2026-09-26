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

## 2. Currency is always CAD

**Gap.** Pare has no notion of currency. Every amount is treated as CAD
(formatters hardcode it, e.g. `lib/db/insights.ts`). A US account — imported via
OFX, SimpleFIN, or the Bank of America CSV parser — has its USD balances summed
into net worth and its USD spend mixed into every chart as if it were CAD.

**Decided direction.** Pare stays single-currency: ALL data is assumed to be in
one currency, which the user picks once at setup (first-run profile creation)
and can change later in /profile. No per-account currency, no FX conversion.
- Store the choice on the profile (`app_user`), default CAD for existing installs.
- Replace every hardcoded `"CAD"` formatter (e.g. `lib/db/insights.ts`,
  `lib/format.ts`, the share card) with the profile currency.
- Mixing accounts in different real-world currencies stays unsupported by
  design; the setup copy should say so.

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
