"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PALETTE } from "@/lib/colors";
import {
  INVESTMENT_ACCOUNT_TYPES,
  INVESTMENT_ACCOUNT_TYPE_LABELS,
  type InvestmentAccountType,
} from "@/lib/investment-types";

interface BalanceEntry {
  id: number;
  balance: number;
  as_of_date: string;
}

interface InvestmentAccount {
  id: number;
  name: string;
  account_type: InvestmentAccountType;
  institution: string | null;
  note: string | null;
  closed: boolean;
  history: BalanceEntry[]; // newest first
  currentBalance: number | null;
  asOf: string | null;
  change: number | null;
}

async function postAction(body: Record<string, unknown>): Promise<{ error?: string }> {
  const res = await fetch("/api/investments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || "Request failed" };
  return {};
}

// Local-calendar YYYY-MM-DD (en-CA formats ISO-style) — toISOString() would
// give tomorrow's date for an evening entry west of UTC.
function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

const INPUT_CLASS = "mt-1 w-full border border-input bg-background px-3 py-2 font-mono text-sm";
const LABEL_CLASS = "font-mono text-xs tracking-widest text-muted-foreground";

export default function InvestmentsPage() {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [balanceId, setBalanceId] = useState<number | null>(null);
  const [manageId, setManageId] = useState<number | null>(null);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/investments");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const editing = accounts.find((a) => a.id === editId) ?? null;
  const updating = accounts.find((a) => a.id === balanceId) ?? null;
  const managing = accounts.find((a) => a.id === manageId) ?? null;

  const open = accounts.filter((a) => !a.closed);
  const total = open.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="font-mono text-2xl font-bold tracking-tight uppercase mb-6">
          INVESTMENTS
        </h1>
        <p className="text-muted-foreground font-mono text-sm">LOADING...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight uppercase">
            INVESTMENTS
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Retirement and brokerage balances. Counted in net worth only — never in
            income, cashflow, or the forecast.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setAddOpen(true)}
          className="font-mono text-xs tracking-widest uppercase shrink-0"
        >
          ADD ACCOUNT
        </Button>
        <AccountDetailsDialog
          mode="create"
          account={null}
          open={addOpen}
          onOpenChange={setAddOpen}
          onSaved={fetchAccounts}
        />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-mono text-sm text-muted-foreground mb-4">
              NO INVESTMENT ACCOUNTS YET
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Add an account once (a 401(k), IRA, brokerage…), then update its balance
              whenever you check it. Each update adds a point to its net-worth trend.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent>
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                TOTAL INVESTED
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums">{formatCurrency(total)}</p>
              <p className="text-xs text-muted-foreground">
                {open.length} open account{open.length === 1 ? "" : "s"} · latest balance of each
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                onUpdateBalance={() => setBalanceId(a.id)}
                onEdit={() => setEditId(a.id)}
                onManage={() => setManageId(a.id)}
              />
            ))}
          </div>
        </>
      )}

      {editing && (
        <AccountDetailsDialog
          // Remount (fresh useState initializers) when the target changes.
          key={editing.id}
          mode="edit"
          account={editing}
          open={editId !== null}
          onOpenChange={(o) => !o && setEditId(null)}
          onSaved={fetchAccounts}
        />
      )}

      {updating && (
        <UpdateBalanceDialog
          key={updating.id}
          account={updating}
          open={balanceId !== null}
          onOpenChange={(o) => !o && setBalanceId(null)}
          onSaved={fetchAccounts}
        />
      )}

      {managing && (
        <ManageAccountDialog
          key={managing.id}
          account={managing}
          open={manageId !== null}
          onOpenChange={(o) => !o && setManageId(null)}
          onSaved={fetchAccounts}
        />
      )}
    </div>
  );
}

function AccountCard({
  account,
  onUpdateBalance,
  onEdit,
  onManage,
}: {
  account: InvestmentAccount;
  onUpdateBalance: () => void;
  onEdit: () => void;
  onManage: () => void;
}) {
  return (
    <Card className={account.closed ? "opacity-60" : undefined}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold uppercase break-words">{account.name}</p>
            {account.institution && (
              <p className="text-xs text-muted-foreground mt-0.5">{account.institution}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {account.closed && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 border border-border text-muted-foreground">
                CLOSED
              </span>
            )}
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 border"
              style={{ borderColor: PALETTE.slate, color: PALETTE.slate }}
            >
              {INVESTMENT_ACCOUNT_TYPE_LABELS[account.account_type]}
            </span>
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">BALANCE</p>
          {account.currentBalance === null ? (
            <p className="text-xs text-muted-foreground mt-1">No balance entered yet.</p>
          ) : (
            <>
              <p className="font-mono text-lg font-bold tabular-nums">
                {formatCurrency(account.currentBalance)}
              </p>
              <p className="text-xs text-muted-foreground">
                as of {account.asOf}
                {account.change !== null && (
                  <>
                    {" · "}
                    <span
                      className="font-mono tabular-nums"
                      style={{
                        color:
                          account.change > 0
                            ? PALETTE.sage
                            : account.change < 0
                              ? PALETTE.terracotta
                              : undefined,
                      }}
                    >
                      {account.change >= 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(account.change))}
                    </span>{" "}
                    since last
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-1">
          {!account.closed && (
            <Button
              onClick={onUpdateBalance}
              className="w-full font-mono text-xs tracking-widest uppercase"
            >
              UPDATE BALANCE
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onEdit}
              className="flex-1 font-mono text-xs tracking-widest uppercase"
            >
              EDIT
            </Button>
            <Button
              variant="outline"
              onClick={onManage}
              className="flex-1 font-mono text-xs tracking-widest uppercase"
            >
              HISTORY
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Shared by "ADD ACCOUNT" (account = null) and the per-card "EDIT".
function AccountDetailsDialog({
  mode,
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  account: InvestmentAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [accountType, setAccountType] = useState<InvestmentAccountType>(
    account?.account_type ?? "401k"
  );
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [note, setNote] = useState(account?.note ?? "");
  // Create mode only: optional opening balance so a new account isn't empty.
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(todayLocal());
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setAccountType("401k");
    setInstitution("");
    setNote("");
    setBalance("");
    setAsOf(todayLocal());
    setError(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const balanceNum = Number(balance);
    if (mode === "create" && balance && (!Number.isFinite(balanceNum) || balanceNum < 0 || !asOf)) {
      setError("Opening balance needs a non-negative amount and a date");
      return;
    }
    const res = await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: mode === "create" ? "create_account" : "update_account",
        ...(mode === "edit" ? { id: account!.id } : {}),
        name,
        account_type: accountType,
        institution,
        note,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Request failed");
      return;
    }
    if (mode === "create" && balance) {
      const { error: err } = await postAction({
        action: "set_balance",
        account_id: data.id,
        balance: balanceNum,
        as_of_date: asOf,
      });
      if (err) {
        // The account exists now — surface the balance failure but still
        // refresh so the user can retry from the card.
        setError(`Account added, but the balance failed: ${err}`);
        onSaved();
        return;
      }
    }
    if (mode === "create") reset();
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o && mode === "create") reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono tracking-widest uppercase">
            {mode === "create" ? "ADD ACCOUNT" : "EDIT ACCOUNT"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <label className={LABEL_CLASS}>NAME</label>
            <input
              className={INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Work 401(k)"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>TYPE</label>
            <Select
              value={accountType}
              onValueChange={(v) => setAccountType((v as InvestmentAccountType) ?? "401k")}
            >
              <SelectTrigger className="mt-1 w-full font-mono text-sm">
                <SelectValue>
                  {(v: InvestmentAccountType) => INVESTMENT_ACCOUNT_TYPE_LABELS[v]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INVESTMENT_ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="font-mono text-xs">
                    {INVESTMENT_ACCOUNT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={LABEL_CLASS}>INSTITUTION (OPTIONAL)</label>
            <input
              className={INPUT_CLASS}
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Fidelity"
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>NOTE (OPTIONAL)</label>
            <input className={INPUT_CLASS} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {mode === "create" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLASS}>BALANCE (OPTIONAL)</label>
                <InputGroup className="mt-1">
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>$</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="font-mono"
                  />
                </InputGroup>
              </div>
              <div>
                <label className={LABEL_CLASS}>AS OF</label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                />
              </div>
            </div>
          )}
          {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          <Button onClick={handleSave} className="w-full font-mono text-xs tracking-widest uppercase">
            {mode === "create" ? "ADD ACCOUNT" : "SAVE CHANGES"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UpdateBalanceDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  account: InvestmentAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(todayLocal());
  const [error, setError] = useState<string | null>(null);

  const existing = account.history.find((h) => h.as_of_date === asOf);

  const handleSave = async () => {
    const balanceNum = Number(balance);
    if (!balance || !Number.isFinite(balanceNum) || balanceNum < 0 || !asOf) {
      setError("Enter a non-negative balance and a date");
      return;
    }
    const { error: err } = await postAction({
      action: "set_balance",
      account_id: account.id,
      balance: balanceNum,
      as_of_date: asOf,
    });
    if (err) {
      setError(err);
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono tracking-widest uppercase">UPDATE BALANCE</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <p className="font-mono text-sm font-bold uppercase">{account.name}</p>
          {account.currentBalance !== null && (
            <p className="text-xs text-muted-foreground">
              Last: {formatCurrency(account.currentBalance)} on {account.asOf}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>BALANCE</label>
              <InputGroup className="mt-1">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  type="number"
                  autoFocus
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="font-mono"
                />
              </InputGroup>
            </div>
            <div>
              <label className={LABEL_CLASS}>AS OF</label>
              <input
                type="date"
                className={INPUT_CLASS}
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>
          </div>
          {existing && (
            <p className="text-xs text-muted-foreground">
              Replaces the {formatCurrency(existing.balance)} already entered for {asOf}.
            </p>
          )}
          {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          <Button onClick={handleSave} className="w-full font-mono text-xs tracking-widest uppercase">
            SAVE BALANCE
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageAccountDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  account: InvestmentAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (body: Record<string, unknown>) => {
    const { error: err } = await postAction(body);
    if (err) {
      setError(err);
      return false;
    }
    setError(null);
    onSaved();
    return true;
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (await run({ action: "delete_account", id: account.id })) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full sm:max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-widest uppercase">{account.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {error && <p className="font-mono text-xs text-destructive">{error}</p>}

          <section>
            <p className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
              BALANCE HISTORY
            </p>
            <div className="space-y-1">
              {account.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm font-mono">
                  <span>{h.as_of_date}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{formatCurrency(h.balance)}</span>
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => run({ action: "delete_balance", id: h.id, account_id: account.id })}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              ))}
              {account.history.length === 0 && (
                <p className="text-xs text-muted-foreground">No balances entered yet.</p>
              )}
            </div>
          </section>

          <section className="border-t border-border pt-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              {account.closed
                ? "Closed: its history stays in net worth, but its last balance no longer carries forward past that month."
                : "Close an account you've emptied or rolled over (e.g. an old 401(k) moved to an IRA). Net worth keeps its history but stops counting it after the month of its last balance."}
            </p>
            <Button
              variant="outline"
              onClick={() => run({ action: "set_closed", id: account.id, closed: !account.closed })}
              className="w-full font-mono text-xs tracking-widest uppercase"
            >
              {account.closed ? "REOPEN ACCOUNT" : "MARK CLOSED"}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="w-full font-mono text-xs tracking-widest uppercase"
            >
              {confirmDelete ? "CONFIRM — DELETE ACCOUNT + HISTORY" : "DELETE ACCOUNT"}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
