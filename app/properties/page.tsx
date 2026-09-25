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
  DialogTrigger,
} from "@/components/ui/dialog";
import { PALETTE } from "@/lib/colors";

type PropertyType = "primary" | "rental" | "vacation" | "other";

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  primary: "PRIMARY RESIDENCE",
  rental: "RENTAL",
  vacation: "VACATION HOME",
  other: "OTHER",
};

interface Mortgage {
  id: number;
  outstanding_amount: number;
  date_opened: string;
  rate: number;
  amortization_years: number;
  calculated_payment: number | null;
  payment_override: number | null;
}

interface Expense {
  id: number;
  label: string;
  monthly_amount: number;
}

interface ValueEntry {
  id: number;
  value: number;
  effective_date: string;
}

interface PropertySummary {
  id: number;
  name: string;
  address: string | null;
  property_type: PropertyType;
  monthly_rental_income: number | null;
  mortgage: Mortgage | null;
  expenses: Expense[];
  valueHistory: ValueEntry[];
  currentValue: number;
  outstandingAmount: number;
  netValue: number;
  effectivePayment: number;
  totalExpenses: number;
  rentalIncome: number | null;
  netIncome: number | null;
}

async function postAction(body: Record<string, unknown>): Promise<{ error?: string }> {
  const res = await fetch("/api/properties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || "Request failed" };
  return {};
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [manageId, setManageId] = useState<number | null>(null);

  const fetchProperties = useCallback(async () => {
    const res = await fetch("/api/properties");
    const data = await res.json();
    setProperties(data.properties ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const managing = properties.find((p) => p.id === manageId) ?? null;

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="font-mono text-2xl font-bold tracking-tight uppercase mb-6">
          PROPERTIES
        </h1>
        <p className="text-muted-foreground font-mono text-sm">LOADING...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-6">
        <h1 className="font-mono text-2xl font-bold tracking-tight uppercase">
          PROPERTIES
        </h1>
        <AddPropertyDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onSaved={fetchProperties}
        />
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-mono text-sm text-muted-foreground mb-4">
              NO PROPERTIES YET
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Add a property to track its mortgage, recurring expenses, and
              (if it's a rental) net income.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px] bg-border border border-border">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} onManage={() => setManageId(p.id)} />
          ))}
        </div>
      )}

      {managing && (
        <ManagePropertyDialog
          property={managing}
          open={manageId !== null}
          onOpenChange={(open) => !open && setManageId(null)}
          onSaved={fetchProperties}
        />
      )}
    </div>
  );
}

function PropertyCard({
  property,
  onManage,
}: {
  property: PropertySummary;
  onManage: () => void;
}) {
  const isRental = property.property_type === "rental";
  return (
    <Card className="rounded-none border-0">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm font-bold uppercase">{property.name}</p>
            {property.address && (
              <p className="text-xs text-muted-foreground mt-0.5">{property.address}</p>
            )}
          </div>
          <span
            className="font-mono text-[10px] px-1.5 py-0.5 border shrink-0"
            style={{ borderColor: PALETTE.slate, color: PALETTE.slate }}
          >
            {PROPERTY_TYPE_LABELS[property.property_type]}
          </span>
        </div>

        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
            NET VALUE
          </p>
          <p
            className="font-mono text-lg font-bold"
            style={{ color: property.netValue < 0 ? PALETTE.terracotta : undefined }}
          >
            {formatCurrency(property.netValue)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(property.currentValue)} value −{" "}
            {formatCurrency(property.outstandingAmount)} mortgage
          </p>
        </div>

        {isRental && (
          <div>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
              NET INCOME / MO
            </p>
            <p
              className="font-mono text-lg font-bold"
              style={{
                color: (property.netIncome ?? 0) < 0 ? PALETTE.terracotta : PALETTE.sage,
              }}
            >
              {formatCurrency(property.netIncome ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(property.rentalIncome ?? 0)} rent −{" "}
              {formatCurrency(property.effectivePayment + property.totalExpenses)} costs
            </p>
          </div>
        )}

        <Button
          variant="outline"
          onClick={onManage}
          className="w-full font-mono text-xs tracking-widest uppercase mt-1"
        >
          MANAGE
        </Button>
      </CardContent>
    </Card>
  );
}

function AddPropertyDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("primary");
  const [rentalIncome, setRentalIncome] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setAddress("");
    setPropertyType("primary");
    setRentalIncome("");
    setError(null);
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const { error: err } = await postAction({
      action: "create_property",
      name,
      address: address || null,
      property_type: propertyType,
      monthly_rental_income:
        propertyType === "rental" && rentalIncome ? Number(rentalIncome) : null,
    });
    if (err) {
      setError(err);
      return;
    }
    reset();
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger className="inline-flex items-center justify-center border border-input bg-background px-4 py-2 font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-accent-foreground">
        ADD PROPERTY
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono tracking-widest uppercase">
            ADD PROPERTY
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <label className="font-mono text-xs tracking-widest text-muted-foreground">
              NAME
            </label>
            <input
              className="mt-1 w-full border border-input bg-background px-3 py-2 font-mono text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div>
            <label className="font-mono text-xs tracking-widest text-muted-foreground">
              ADDRESS (OPTIONAL)
            </label>
            <input
              className="mt-1 w-full border border-input bg-background px-3 py-2 font-mono text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="font-mono text-xs tracking-widest text-muted-foreground">
              TYPE
            </label>
            <Select
              value={propertyType}
              onValueChange={(v) => setPropertyType((v as PropertyType) ?? "primary")}
            >
              <SelectTrigger className="mt-1 font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
                  <SelectItem key={t} value={t} className="font-mono text-xs">
                    {PROPERTY_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {propertyType === "rental" && (
            <div>
              <label className="font-mono text-xs tracking-widest text-muted-foreground">
                MONTHLY RENTAL INCOME
              </label>
              <InputGroup className="mt-1">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  type="number"
                  value={rentalIncome}
                  onChange={(e) => setRentalIncome(e.target.value)}
                  placeholder="2500"
                  className="font-mono"
                />
              </InputGroup>
            </div>
          )}
          {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          <Button onClick={handleAdd} className="w-full font-mono text-xs tracking-widest uppercase">
            ADD PROPERTY
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManagePropertyDialog({
  property,
  open,
  onOpenChange,
  onSaved,
}: {
  property: PropertySummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  // Mortgage form state
  const [outstanding, setOutstanding] = useState(
    String(property.mortgage?.outstanding_amount ?? "")
  );
  const [dateOpened, setDateOpened] = useState(property.mortgage?.date_opened ?? "");
  const [rate, setRate] = useState(String(property.mortgage?.rate ?? ""));
  const [amortYears, setAmortYears] = useState(
    String(property.mortgage?.amortization_years ?? "")
  );
  const [override, setOverride] = useState(
    property.mortgage?.payment_override != null ? String(property.mortgage.payment_override) : ""
  );

  // New expense / value entry form state
  const [expenseLabel, setExpenseLabel] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [valueAmount, setValueAmount] = useState("");
  const [valueDate, setValueDate] = useState("");

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

  const handleSaveMortgage = async () => {
    const outstandingNum = Number(outstanding);
    const rateNum = Number(rate);
    const amortNum = Number(amortYears);
    if (!Number.isFinite(outstandingNum) || outstandingNum < 0) {
      setError("Outstanding amount must be a non-negative number");
      return;
    }
    if (!dateOpened) {
      setError("Date opened is required");
      return;
    }
    await run({
      action: "set_mortgage",
      property_id: property.id,
      outstanding_amount: outstandingNum,
      date_opened: dateOpened,
      rate: rateNum,
      amortization_years: amortNum,
      payment_override: override ? Number(override) : null,
    });
  };

  const handleDeleteMortgage = async () => {
    await run({ action: "delete_mortgage", property_id: property.id });
  };

  const handleAddExpense = async () => {
    const amt = Number(expenseAmount);
    if (!expenseLabel.trim() || !Number.isFinite(amt) || amt < 0) {
      setError("Expense needs a label and a non-negative amount");
      return;
    }
    const ok = await run({
      action: "add_expense",
      property_id: property.id,
      label: expenseLabel,
      monthly_amount: amt,
    });
    if (ok) {
      setExpenseLabel("");
      setExpenseAmount("");
    }
  };

  const handleDeleteExpense = async (id: number) => {
    await run({ action: "delete_expense", id, property_id: property.id });
  };

  const handleAddValue = async () => {
    const val = Number(valueAmount);
    if (!Number.isFinite(val) || val < 0 || !valueDate) {
      setError("Value entry needs a non-negative amount and a date");
      return;
    }
    const ok = await run({
      action: "add_value_entry",
      property_id: property.id,
      value: val,
      effective_date: valueDate,
    });
    if (ok) {
      setValueAmount("");
      setValueDate("");
    }
  };

  const handleDeleteValueEntry = async (id: number) => {
    await run({ action: "delete_value_entry", id, property_id: property.id });
  };

  const handleDeleteProperty = async () => {
    const { error: err } = await postAction({ action: "delete_property", id: property.id });
    if (err) {
      setError(err);
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-widest uppercase">
            {property.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {error && <p className="font-mono text-xs text-destructive">{error}</p>}

          <section>
            <p className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
              MORTGAGE
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  OUTSTANDING
                </label>
                <InputGroup className="mt-1">
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>$</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    type="number"
                    value={outstanding}
                    onChange={(e) => setOutstanding(e.target.value)}
                    className="font-mono"
                  />
                </InputGroup>
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  DATE OPENED
                </label>
                <input
                  type="date"
                  className="mt-1 w-full border border-input bg-background px-3 py-2 font-mono text-sm"
                  value={dateOpened}
                  onChange={(e) => setDateOpened(e.target.value)}
                />
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  RATE (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full border border-input bg-background px-3 py-2 font-mono text-sm"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  AMORTIZATION (YEARS)
                </label>
                <input
                  type="number"
                  className="mt-1 w-full border border-input bg-background px-3 py-2 font-mono text-sm"
                  value={amortYears}
                  onChange={(e) => setAmortYears(e.target.value)}
                />
              </div>
            </div>
            {property.mortgage?.calculated_payment != null && (
              <p className="text-xs text-muted-foreground mt-2">
                Calculated P&amp;I: {formatCurrency(property.mortgage.calculated_payment)}/mo
              </p>
            )}
            <div className="mt-2">
              <label className="font-mono text-[10px] tracking-widest text-muted-foreground">
                OVERRIDE MONTHLY PAYMENT (OPTIONAL)
              </label>
              <InputGroup className="mt-1">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  type="number"
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  placeholder={
                    property.mortgage?.calculated_payment
                      ? String(Math.round(property.mortgage.calculated_payment))
                      : ""
                  }
                  className="font-mono"
                />
              </InputGroup>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                onClick={handleSaveMortgage}
                className="flex-1 font-mono text-xs tracking-widest uppercase"
              >
                SAVE MORTGAGE
              </Button>
              {property.mortgage && (
                <Button
                  variant="outline"
                  onClick={handleDeleteMortgage}
                  className="font-mono text-xs tracking-widest uppercase"
                >
                  CLEAR
                </Button>
              )}
            </div>
          </section>

          <section>
            <p className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
              RECURRING EXPENSES
            </p>
            <div className="space-y-1">
              {property.expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm font-mono">
                  <span>{e.label}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatCurrency(e.monthly_amount)}/mo</span>
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteExpense(e.id)}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              ))}
              {property.expenses.length === 0 && (
                <p className="text-xs text-muted-foreground">No recurring expenses yet.</p>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                className="flex-1 border border-input bg-background px-3 py-2 font-mono text-sm"
                placeholder="Property tax"
                value={expenseLabel}
                onChange={(e) => setExpenseLabel(e.target.value)}
              />
              <InputGroup className="w-32">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="font-mono"
                />
              </InputGroup>
              <Button onClick={handleAddExpense} className="font-mono text-xs tracking-widest uppercase">
                ADD
              </Button>
            </div>
          </section>

          <section>
            <p className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
              VALUE HISTORY
            </p>
            <div className="space-y-1">
              {property.valueHistory.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm font-mono">
                  <span>{v.effective_date}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatCurrency(v.value)}</span>
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteValueEntry(v.id)}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              ))}
              {property.valueHistory.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No value entered yet — net value shows as $0 minus the mortgage until you add one.
                </p>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                type="date"
                className="flex-1 border border-input bg-background px-3 py-2 font-mono text-sm"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
              />
              <InputGroup className="w-32">
                <InputGroupAddon align="inline-start">
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  type="number"
                  value={valueAmount}
                  onChange={(e) => setValueAmount(e.target.value)}
                  className="font-mono"
                />
              </InputGroup>
              <Button onClick={handleAddValue} className="font-mono text-xs tracking-widest uppercase">
                ADD
              </Button>
            </div>
          </section>

          <section className="border-t border-border pt-4">
            <Button
              variant="destructive"
              onClick={handleDeleteProperty}
              className="w-full font-mono text-xs tracking-widest uppercase"
            >
              DELETE PROPERTY
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
