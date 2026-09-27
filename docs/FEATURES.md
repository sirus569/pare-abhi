# Pare feature guide

Pare is a personal finance app that runs on your own computer. You give it the
statements your bank already produces (PDF, OFX/QFX, or CSV), and it turns them
into a searchable list of transactions, spending charts, a cash-flow forecast,
net worth, budgets, and subscription tracking.

There's no bank login and no data aggregator. Your data lives in a single file
on the machine running Pare, and Pare makes no outbound calls unless you turn
on the optional bank sync yourself.

This guide assumes Pare is already running and you've opened it in your
browser. (Setting it up is covered in the
[README](https://github.com/itsgotpower/pare#self-host-quickstart).) It walks
through every feature: what it is, how to use it, and, in each **Advanced**
section, extra options you can ignore until you want them.

## What Pare can do

| Feature | In one line |
|---|---|
| [First steps](#first-steps) | Create your profile, upload one statement, open the dashboard. |
| [Importing your data](#importing-your-data) | PDF statements, OFX/QFX files, bank CSVs, optional bank sync, and cash entries. |
| [Switching from another app](#switching-from-another-app) | Bring your history over from Mint, Monarch, or YNAB. |
| [Dashboard](#dashboard) | Spending, income, cash flow, forecast, net worth, and a monthly review, all on one page. |
| [Safe to spend](#safe-to-spend) | One number: are you clear until the next payday? |
| [Insights](#insights) | Automatic tips on budgets, unusual charges, and spending changes. |
| [Transactions](#transactions) | Search, filter, recategorize, split, tag, and track reimbursements. |
| [Categories and rules](#categories-and-rules) | Teach Pare how to categorize your merchants, once. |
| [Budget goals](#budget-goals) | Monthly limits per category with progress bars. |
| [Recurring charges](#recurring-charges) | Find subscriptions, spot price hikes, and track the ones you cancel. |
| [Merchants](#merchants) | Everything you've ever spent at one place. |
| [Net worth](#net-worth) | Accounts, investments, property, and anything else you own or owe. |
| [Ask Claude](#ask-claude) | Ask questions about your money in plain language. |
| [Your profile and data](#your-profile-and-data) | Data health, account settings, exports, backups. |
| [Phone app and notifications](#phone-app-and-notifications) | Install Pare on your home screen. |
| [Supported banks](#supported-banks) | Which statements Pare reads today. |
| [Limitations](#limitations) | What Pare doesn't do (yet). |

## First steps

1. **Create your profile.** The first time you open Pare, it asks for a name,
   a password, and your currency (Canadian or US dollars). Pare has one user,
   and this password keeps anyone else on your network out.
2. **Upload a statement.** Open **Upload** from the sidebar and drop in a
   recent statement from your bank or credit card. See
   [Importing your data](#importing-your-data) for which files work.
3. **Open the Dashboard.** Your spending is already sorted into categories.

That's all you need. Everything else in this guide is optional.

### Advanced

- **Navigating.** The sidebar on the left holds every page and the dark-mode
  toggle; collapse it for more room. On a phone, the main pages sit in a tab
  bar at the bottom, and Upload is at the top.
- **Upload first, then explore.** Most pages stay empty until at least one
  statement is loaded. The sidebar flags **Upload** when you have no data yet.

## Importing your data

Pare needs your transactions, and there are several ways to get them in. You
can mix and match: Pare recognizes the same transaction coming in twice and
keeps only one copy.

All uploads happen on the **Upload** page. Drop a file on it (or click to pick
one) and Pare reads it, categorizes every transaction, and updates the
dashboard.

- **PDF statements.** The statement PDF you download from your bank's website.
  Best supported for CIBC and American Express; see
  [Supported banks](#supported-banks).
- **OFX / QFX files.** Most banks offer a "Download for Quicken" or "Download
  for Money" option. These files are the most reliable way to import from any
  bank, because each transaction carries a unique ID from the bank.
- **Bank CSV exports.** Dropping a `.csv` opens an import panel where you pick
  your bank and account type and see a live preview before anything is saved.
- **Cash.** On **Transactions**, **+ ADD CASH** records spending that never
  shows up on a statement.

Not sure where your bank hides its statements? The **Where to get your
statement** section on the Upload page has step-by-step instructions for common
banks. The same guides are online at [pare.money/guides](https://pare.money/guides).

### Advanced

- **Re-uploading is safe.** Uploading the same statement twice, or two files
  that overlap by a few weeks, never creates duplicates.
- **CSV from an unlisted bank.** Choose "Other institution" and Pare guesses
  which columns hold the date, description, and amount. If the dates could be
  read either way (is 03/04 March 4 or April 3?), it asks you to choose. You
  can also flip the sign if your bank prints money going out as a positive
  number. Bank of America checking and savings have a built-in profile.
- **Bank sync with SimpleFIN (optional).** Under **Or: connect a bank** on the
  Upload page, you can link accounts through
  [SimpleFIN Bridge](https://beta-bridge.simplefin.org), a small paid service
  you sign up for directly. Paste the setup token it gives you, choose what
  kind of account each one is, and Pare pulls about the last year of
  transactions, then re-syncs about once a day while you use the dashboard.
  This is the only feature that makes Pare contact another server. Set
  `PARE_SIMPLEFIN_DISABLED=1` to hide it entirely.
- **Balances.** Statements with a closing balance (PDFs, OFX, and bank
  CSVs for chequing and savings accounts) feed [Net worth](#net-worth) and the
  [Forecast](#dashboard). A chequing statement is what the forecast starts from.
- **Removing a bad import.** Profile → **Statements** lists every statement
  you've loaded. **Remove** deletes one along with its transactions; uploading
  the file again brings them back.
- **Sharing from your phone (Android).** Once Pare is installed as an app, you
  can share a PDF or OFX file from your bank's app straight to Pare.
- **Command line.** `python3 lib/parser/parse_statements.py <folder> --json`
  runs the PDF reader on its own, which is handy for checking a new bank's
  statements.

## Switching from another app

Leaving Mint, Monarch, or YNAB? The **Switch** page (`/switch`) imports the CSV
export from those apps, including your categories, in three steps: upload,
preview, confirm.

### Advanced

- Pare detects which app the file came from automatically.
- The preview shows transactions that overlap with data already in Pare, so
  you can import an old app's history alongside your own statements without
  counting anything twice.

## Dashboard

The **Dashboard** is where you'll spend most of your time. Two cards sit at
the top: [Safe to spend](#safe-to-spend) and [Insights](#insights). Below them
are eight tabs:

- **Overview:** monthly spending bars, a category breakdown, totals, goal
  progress, and your top merchants.
- **Review:** a month-in-review: money in, money out, what you saved, your top
  categories and merchants, and how the month compares to the one before.
- **By category:** each category's spending over time. Once you have more than
  a year of data, a **Year over year** section compares the last 12 months to
  the 12 before, and lists the categories that changed most.
- **Income:** income by type (paycheque, refunds, and so on), income against
  spending, your monthly surplus or deficit, and your savings rate over time.
- **Cashflow:** a flow diagram of where each month's money went, from income
  on the left to spending categories and savings on the right. Below it: a
  daily spending calendar, average spending by weekday, and a projection for
  the current month.
- **Forecast:** your chequing balance projected 30, 60, or 90 days ahead,
  with a shaded band showing the likely range.
- **Net worth:** what you own minus what you owe, over time. See
  [Net worth](#net-worth).
- **Baseline:** your "normal" spending with large one-off purchases removed,
  so a single big month doesn't distort the picture.

### Advanced

- **Why the dashboard shows last month.** Statements arrive after the month
  ends, so most views use the latest month you have data for, not today's
  date.
- **How the forecast works.** It starts from the closing balance on your
  latest chequing statement, adds paycheques on your usual schedule, subtracts
  rent and fixed bills on their usual day plus your detected subscriptions,
  and spreads typical everyday spending across the days in between. It's an
  estimate from your own history, not a promise. Without a chequing
  statement, the tab asks you to upload one.
- **Baseline threshold.** Choose whether "large" means $200, $300, or $500. A
  list underneath shows exactly which purchases were left out.
- **Share card.** On the **Review** tab, **Share card** makes an image of
  your month to post or send. By default it shows category percentages only:
  no dollar amounts and never merchant names. Dollar amounts are an explicit
  opt-in.
- **Which spending counts.** The spending charts count credit-card purchases
  and cash entries. Debit-card and bank-account payments show up in Cashflow,
  Income, and Forecast, but not yet in Overview (see
  [Limitations](#limitations)).

## Safe to spend

A single number at the top of the dashboard answering: *after rent and bills,
how much room do I have until my next paycheque?* It's marked **clear**,
**tight**, or **short** depending on how close your projected balance comes to
zero.

### Advanced

- It's based on the [Forecast](#dashboard), so it needs a recent chequing
  statement. When your data is too old for a useful projection, it asks you to
  upload a newer one.
- If Pare can't find a regular paycheque, it looks 30 days ahead instead.
- With [notifications](#phone-app-and-notifications) on, Pare alerts you when a
  new statement puts you in the **short** zone.

## Insights

A short list of automatic tips at the top of the dashboard, most urgent first.
Examples:

- A category that's over (or close to) its [budget goal](#budget-goals)
- A category that jumped or dropped compared to last month
- A charge that's much larger than usual for that merchant
- A subscription that raised its price, or one you marked to cancel that's
  still charging you
- Whether this month is on track for a surplus or a deficit
- A rental property that's losing money

### Advanced

- Insights are simple rules computed on your machine. No AI and no network
  calls are involved.
- Known subscriptions are left out of unusual-charge alerts; their price
  changes get their own alert instead.

## Transactions

**Transactions** is the full, searchable list. Tabs switch between spending,
income, transfers, and everything. Filter by category, account, type, or tag,
or press <kbd>/</kbd> to jump to the search box.

Click any row to open it. From there you can:

- **Change the category.** The change sticks, even when rules are re-applied.
- **Split it** across several categories (for example, one big-box store
  receipt that's part groceries and part household).
- **Add tags**, such as `vacation` or `work`. Tags are separate from
  categories, so a restaurant meal can be both *Restaurants* and `vacation`.
- **Mark it reimbursable.** It appears in an **Outstanding** strip above the
  table until you mark it **Reimbursed**. Click the strip to filter to just
  those rows.

### Advanced

- **Bulk edit.** Click **Select**, tick rows (or the header box for the whole
  page), and give them all one category.
- **Transaction types.** Every transaction has a type: spending, income,
  transfer, card payment, or fee. If Pare gets one wrong (say, a transfer to a
  friend that was really a purchase), change it in the row dialog. Pare offers
  to create a rule so similar transactions are always treated the same way.
  Types set by hand are marked with ✱.
- **Cash entries** can be deleted from their row dialog. Transactions that
  came from a statement can't be; remove the statement instead (see
  [Importing your data](#importing-your-data)).

## Categories and rules

Pare categorizes transactions using keyword rules: *if the description contains
"COFFEE", the category is Coffee*. It starts with a generic set of common
merchants. As you correct categories, your own rules take over.

On **Categories**:

- **Add rule:** enter a keyword and a category. **Add rule & recategorize**
  applies it to your existing transactions straight away.
- **Suggested rules:** when you've corrected the same merchant a few times,
  Pare suggests a rule for it. Accept it, or reject it and it won't come back.

### Advanced

- **Rule order.** The first matching rule wins, so a specific keyword should
  come before a broad one.
- **Recategorize all** re-applies every rule to every transaction. Categories
  you set by hand are never overwritten.
- **Import / export rules** as a JSON file to copy your rules to another Pare
  install.
- **Type rules** (bottom of the page) set a transaction's *type* instead of
  its category. Use one keyword like "E-TRANSFER TO" for the type and a more
  specific one like "E-TRANSFER TO LANDLORD" for the category. The preview
  shows which transactions a keyword would catch before you save it.
- **Rent and bank transfers.** Transfers out of a bank account only take
  categories from rules you've written. To have rent show up as *Rent /
  housing*, add a rule with your landlord's e-transfer name or handle.
- **Your rules survive a wipe.** Custom rules are also saved to
  `data/user-rules.json` and restored automatically if you reset your data.

## Budget goals

**Goals** sets a monthly spending limit per category. Each goal shows a progress
bar: green under 80%, yellow up to 100%, red once you're over.

**Suggested goals** propose a limit 10% below your six-month average for a
category and show how much that would save you in a year. Add one with a
click.

### Advanced

- Goals track the latest month you have data for, the same as the dashboard.
- Goals that are nearly or already over budget also appear in
  [Insights](#insights).

## Recurring charges

**Recurring** finds your subscriptions and other repeating charges
automatically: anything that bills at a steady amount on a steady schedule for
three months or more. You'll see each one's frequency and its monthly and
yearly cost, with warning labels for:

- **Hike +N%:** the price went up recently
- **2×/mo?:** you might be billed twice
- **Gone:** it seems to have stopped charging you

**Mark to cancel** adds a subscription to your **Cancel list**. Until it stops
charging, Pare keeps a running total of what it has cost you since you
marked it. **Cancel ↗** links to cancellation help for well-known services.

**Upcoming bills** lists rent, fixed bills, and subscriptions due in the next
45 days, and flags any your projected balance won't cover.

### Advanced

- Subscriptions marked **Gone** stop counting toward your monthly total and
  are left out of the forecast.
- Your cancel list survives a data reset.

## Merchants

**Merchants** lists everywhere you spend. Open one to see your total, typical
charge, monthly average, how long you've been going there, a month-by-month
chart, and every transaction.

## Net worth

The **Net worth** tab on the dashboard adds up everything you own and owe, and
shows how it changed over time. It pulls from four places:

- **Your statements.** Bank balances count as assets, and credit-card
  balances as debts. This happens automatically.
- **Manual entries** for anything without a statement, like a car or a
  personal loan. Add them with **Add entry** on the Net worth tab. Enter a new
  value with a later date to update it; the old values become history.
- **Investments.** On **Investments**, add each account (401k, IRA, RRSP,
  TFSA, brokerage, HSA, pension, and more) and click **Update balance**
  whenever you check it.
- **Properties.** On **Properties**, add a home or rental with its value and
  mortgage. See Advanced below for details.

### Advanced

- **It's a snapshot, not live.** Each account holds its last known balance
  until you give Pare a newer one.
- **Closed accounts.** Mark an investment account closed (after a rollover,
  for example) to keep its history but stop counting it going forward.
- **Property details.** Pare calculates the mortgage payment from the balance,
  interest rate, and amortization period, and you can override it. Property
  value is a dated history, so appreciation shows as a trend. For rentals,
  enter monthly rent to see net income; a property losing money shows up in
  [Insights](#insights).
- **Why property costs don't appear in cash flow.** Your mortgage payments and
  rent already appear as real transactions once you upload the account that
  pays them. Adding the figures from the Properties page as well would count
  them twice. To have them categorized, add a
  [category rule](#categories-and-rules) for the payment.

## Ask Claude

Pare includes an MCP server, a small connector that lets Claude read your Pare
data and answer questions in plain language:

- *"How much did I spend on restaurants last month?"*
- *"What subscriptions am I paying for?"*
- *"Set a $400 budget for restaurants."*
- *"I spent $40 cash at the farmers' market."*

On self-host, the connector runs entirely on your machine. The **Claude** page
(`/connect`) gives you ready-to-paste setup for Claude Code and Claude Desktop,
filled in with the right paths for your computer.

### Advanced

- **What Claude can do:** 13 read tools (spending, income, cash flow, goals,
  subscriptions, insights, tags, reimbursements, and more) and 11 write tools
  (goals, rules, recategorizing, tags, reimbursements, cash entries, and
  deleting a statement). The full list is in the
  [MCP server README](https://github.com/itsgotpower/pare/blob/main/mcp/README.md).
- **Checking the connection.** Your profile shows whether Claude has
  connected recently.
- **Running it by hand.** `npm run mcp` starts the server. When a client like
  Claude starts it for you, set `PARE_DB_PATH` to the full path of your
  database.
- **What gets shared.** Your data stays on your machine, but the answers
  Claude gives you are produced by Claude, so whatever it looks up is sent to
  Anthropic as part of your conversation.

## Your profile and data

Click your name in the sidebar to open **Profile**.

- **Data health:** how many transactions you have, how many are categorized,
  and per account: the latest statement, a 12-month coverage strip, and a
  reminder when an account hasn't been updated in over 40 days.
- **Statements:** every statement you've loaded, with an option to remove one.
- **Currency:** the one currency all your amounts are in. Pare doesn't
  convert between currencies: if you have accounts in two currencies, convert
  them yourself.
- **Security:** change your password.
- **Export:** download everything as CSV or JSON, or **Backup DB** for a
  complete copy of the database.

### Advanced

- **Managing an account.** Each account in Data health has a **Manage**
  button:
  - **Nickname:** shown everywhere instead of the generated name.
  - **Hide from charts:** removes the account from every chart and total. It
    still appears in exports.
  - **Mark closed:** keeps its history but stops update reminders and stops
    counting its last balance in net worth and the forecast.
- **Where your data lives.** Everything is in the `data/` folder where Pare
  runs: the database (`data/pare.db`) and your custom rules
  (`data/user-rules.json`), among a few settings files.
- **Restoring a backup.** Stop Pare, copy the backup file over
  `data/pare.db`, and start it again.
- **Wiping your data** (Danger zone) deletes all transactions, statements,
  properties, and investment accounts, and keeps your rules, goals, account
  settings, and cancel list. Type `WIPE` to confirm. There's no undo, so make a
  backup first.
- **Feedback.** The sidebar's **Feedback** link opens a GitHub issue. Nothing
  is sent from your install.

## Phone app and notifications

Pare can be installed like an app. Open it in your phone's browser and choose
**Add to Home Screen**. After your first upload, Pare also offers an install
button. The installed app opens in dark mode, and your last-loaded data stays
readable offline.

### Advanced

- **Notifications.** After an upload, **Get parse alerts** turns on
  notifications for finished uploads and for [Safe to spend](#safe-to-spend)
  dropping into the short zone. Browsers only allow notifications from pages
  served over HTTPS or from `localhost`.
- **Notification keys.** Pare creates its own notification keys in
  `data/vapid.json`. To use your own, set `PARE_VAPID_PUBLIC_KEY` and
  `PARE_VAPID_PRIVATE_KEY`.

## Supported banks

| Bank | PDF statements | Notes |
|---|---|---|
| CIBC (Visa and chequing) | Tested with real statements | |
| American Express | Tested with real statements | |
| RBC, TD, Scotiabank, BMO, Tangerine, Wealthsimple | Beta | Built from each bank's published layout; not yet tested with real statements. Use OFX/QFX if a PDF doesn't read correctly. |
| Bank of America | — | Checking and savings CSV exports are supported. |
| Any other bank | — | OFX/QFX export, CSV export ("Other institution"), or SimpleFIN sync. |

A beta reader that can't make sense of a line skips it rather than guessing.
You might see a few missing transactions, but never wrong totals. Want to help
tune the reader for your bank? See the
[parser contribution guide](https://github.com/itsgotpower/pare/blob/main/docs/parser-contributions.md).

## Limitations

What Pare doesn't do yet, stated plainly:

- **Debit-card spending isn't in the Overview charts.** Purchases from a bank
  account appear in Cashflow, Income, and Forecast, but Overview and By
  category count only credit-card and cash spending.
- **One currency.** Every account is assumed to be in the currency you picked.
  Pare doesn't convert, and doesn't yet warn when an imported file is in a
  different currency.
- **No combined cash total.** Pare doesn't show one number for all your bank
  accounts together.
- **Investments are balances only.** Pare tracks what each account is worth,
  not the holdings, trades, or returns.
- **Forecasts and net worth are only as fresh as your latest statement.**
  Unless you use bank sync, nothing updates between uploads.
- **One user per install.** Self-hosted Pare has a single profile.

The full, technical list lives in
[docs/future-improvements.md](https://github.com/itsgotpower/pare/blob/main/docs/future-improvements.md).
