import { getDb } from "../db";
import type { InvestmentAccountType } from "../investment-types";

// Investment + retirement accounts (migration 016): account metadata plus a
// dated balance history. Feeds Net Worth only (see networth.ts).

export interface InvestmentAccount {
  id: number;
  name: string;
  account_type: InvestmentAccountType;
  institution: string | null;
  note: string | null;
  closed: boolean;
  created_at: string;
}

export interface InvestmentBalanceEntry {
  id: number;
  account_id: number;
  balance: number;
  as_of_date: string;
}

export interface InvestmentAccountSummary extends InvestmentAccount {
  history: InvestmentBalanceEntry[]; // newest first
  currentBalance: number | null; // null until a balance is entered
  asOf: string | null;
  change: number | null; // latest − previous entry; null with < 2 entries
}

export interface InvestmentAccountInput {
  name: string;
  account_type: InvestmentAccountType;
  institution?: string | null;
  note?: string | null;
}

type AccountRow = Omit<InvestmentAccount, "closed"> & { closed: number };

function toAccount(row: AccountRow): InvestmentAccount {
  return { ...row, closed: row.closed === 1 };
}

export function getInvestmentAccount(id: number): InvestmentAccount | null {
  const row = getDb()
    .prepare("SELECT * FROM investment_accounts WHERE id = ?")
    .get(id) as AccountRow | undefined;
  return row ? toAccount(row) : null;
}

export function addInvestmentAccount(input: InvestmentAccountInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO investment_accounts (name, account_type, institution, note)
       VALUES (@name, @account_type, @institution, @note)`
    )
    .run({ institution: null, note: null, ...input });
  return Number(result.lastInsertRowid);
}

export function updateInvestmentAccount(id: number, input: InvestmentAccountInput): void {
  const result = getDb()
    .prepare(
      `UPDATE investment_accounts
       SET name = @name, account_type = @account_type, institution = @institution, note = @note
       WHERE id = @id`
    )
    .run({ institution: null, note: null, ...input, id });
  if (result.changes === 0) throw new Error(`Investment account ${id} not found`);
}

export function setInvestmentAccountClosed(id: number, closed: boolean): void {
  const result = getDb()
    .prepare("UPDATE investment_accounts SET closed = ? WHERE id = ?")
    .run(closed ? 1 : 0, id);
  if (result.changes === 0) throw new Error(`Investment account ${id} not found`);
}

export function deleteInvestmentAccount(id: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM investment_balance_history WHERE account_id = ?").run(id);
    db.prepare("DELETE FROM investment_accounts WHERE id = ?").run(id);
  })();
}

// Upsert on (account_id, as_of_date): one balance per account per day, so
// re-entering a date corrects it instead of adding a competing observation.
export function setInvestmentBalance(
  accountId: number,
  input: { balance: number; as_of_date: string }
): void {
  if (!getInvestmentAccount(accountId)) {
    throw new Error(`Investment account ${accountId} not found`);
  }
  getDb()
    .prepare(
      `INSERT INTO investment_balance_history (account_id, balance, as_of_date)
       VALUES (@account_id, @balance, @as_of_date)
       ON CONFLICT(account_id, as_of_date) DO UPDATE SET balance = excluded.balance`
    )
    .run({ account_id: accountId, ...input });
}

// accountId scopes the delete — a mismatched (accountId, id) pair fails loudly.
export function deleteInvestmentBalance(accountId: number, id: number): void {
  const result = getDb()
    .prepare("DELETE FROM investment_balance_history WHERE id = ? AND account_id = ?")
    .run(id, accountId);
  if (result.changes === 0) {
    throw new Error(`Balance entry ${id} not found for investment account ${accountId}`);
  }
}

function summarize(account: InvestmentAccount, history: InvestmentBalanceEntry[]): InvestmentAccountSummary {
  const [latest, previous] = history;
  return {
    ...account,
    history,
    currentBalance: latest?.balance ?? null,
    asOf: latest?.as_of_date ?? null,
    change: latest && previous ? latest.balance - previous.balance : null,
  };
}

export function getInvestmentAccountSummary(id: number): InvestmentAccountSummary | null {
  const account = getInvestmentAccount(id);
  if (!account) return null;
  const history = getDb()
    .prepare(
      "SELECT * FROM investment_balance_history WHERE account_id = ? ORDER BY as_of_date DESC, id DESC"
    )
    .all(id) as InvestmentBalanceEntry[];
  return summarize(account, history);
}

// Open accounts first, then by name.
export function listInvestmentAccountsWithSummary(): InvestmentAccountSummary[] {
  const db = getDb();
  const accounts = (
    db.prepare("SELECT * FROM investment_accounts ORDER BY closed, name COLLATE NOCASE, id").all() as AccountRow[]
  ).map(toAccount);
  const history = db
    .prepare("SELECT * FROM investment_balance_history ORDER BY as_of_date DESC, id DESC")
    .all() as InvestmentBalanceEntry[];
  const byAccount = new Map<number, InvestmentBalanceEntry[]>();
  for (const h of history) {
    const list = byAccount.get(h.account_id) ?? [];
    list.push(h);
    byAccount.set(h.account_id, list);
  }
  return accounts.map((a) => summarize(a, byAccount.get(a.id) ?? []));
}
