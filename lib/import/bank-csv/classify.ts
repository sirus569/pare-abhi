// Flow inference for bank-CSV rows. CSV exports carry no transaction type, so
// flow comes from the account kind, the normalized sign, and description
// patterns. Generic banking rails/issuers only — never personal merchants.

import type { OfxTransaction } from "../ofx";
import type { CsvAccountKind } from "./types";

const FEE_RE = /\bFEES?\b|SERVICE CHARGE|OVERDRAFT|\bNSF\b|INTEREST CHARGED/;
// Credit-card bill payments leaving a deposit account. Issuer names are
// REQUIRED — `DES:PAYMENT` alone is also how utilities bill, and misfiling those
// as `payment` would hide real outflow.
const CARD_PAYMENT_RE =
  /APPLECARD|CREDIT CRD|CRCARDPMT|AMERICAN EXPRESS|AMEX EPAYMENT|\bDISCOVER\b|CAPITAL ONE|CITI (?:CARD|AUTOPAY)|BANK OF AMERICA CREDIT CARD|BK OF AMER (?:VISA|MC)|SYNCHRONY|BARCLAYCARD|CARDMEMBER SERV/;
const PAYROLL_RE = /PAYROLL|DIRECT DEP|DES:SALARY/;
// Person-to-person and between-account movement. A transfer on a deposit
// account only counts as outflow once a user rule categorizes it (e.g. rent
// paid by Zelle) — same contract as CIBC e-transfers.
const TRANSFER_RE =
  /\bZELLE\b|E-TRANSFER|ONLINE BANKING TRANSFER|ONLINE TRANSFER|TRANSFER (?:TO|FROM)|\bATM\b|WITHDRWL|\bVENMO\b/;

// `signedAmount`: NEGATIVE = money out (withdrawal / card charge).
export function classifyCsvRow(
  kind: CsvAccountKind,
  description: string,
  signedAmount: number
): Pick<OfxTransaction, "flow" | "category"> {
  const out = signedAmount < 0;

  if (kind === "card") {
    // Same contract as the OFX card branch: money onto the card is a payment
    // or refund (excluded from spend), everything else is a charge.
    return out
      ? { flow: "spend", category: "Other / uncategorized" }
      : { flow: "payment", category: "Banking" };
  }

  const t = description.toUpperCase();
  if (out && FEE_RE.test(t)) return { flow: "fee_interest", category: "Banking" };
  if (out && CARD_PAYMENT_RE.test(t)) return { flow: "payment", category: "Banking" };
  if (!out && PAYROLL_RE.test(t)) return { flow: "income", category: "Banking" };
  if (TRANSFER_RE.test(t)) return { flow: "transfer", category: "Banking" };
  return out ? { flow: "spend", category: "Banking" } : { flow: "income", category: "Banking" };
}
