import { NextRequest } from "next/server";
import { getScopedRepo, unauthorized } from "@/lib/repo/scoped";
import type { InvestmentAccountInput } from "@/lib/db/investments";
import { INVESTMENT_ACCOUNT_TYPES, isInvestmentAccountType } from "@/lib/investment-types";

// Investment + retirement accounts (metadata + dated balance history). Single
// action-discriminated route, same convention as /api/properties.

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function notFound(error: string) {
  return Response.json({ error }, { status: 404 });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The lib layer throws on a missing account / mismatched (accountId, id) pair
// — the source-of-truth check. Convert it to an HTTP response instead of a 500.
async function runOrRespondError<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return message.includes("not found") ? notFound(message) : badRequest(message);
  }
}

function optionalText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseAccountInput(body: Record<string, unknown>): InvestmentAccountInput | string {
  if (typeof body.name !== "string" || !body.name.trim()) return "name required";
  if (!isInvestmentAccountType(body.account_type)) {
    return `account_type must be one of ${INVESTMENT_ACCOUNT_TYPES.join(", ")}`;
  }
  return {
    name: body.name.trim(),
    account_type: body.account_type,
    institution: optionalText(body.institution),
    note: optionalText(body.note),
  };
}

export async function GET(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();
  return Response.json({ accounts: await repo.investments.list() });
}

export async function POST(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  switch (body.action) {
    case "create_account": {
      const input = parseAccountInput(body);
      if (typeof input === "string") return badRequest(input);
      const id = await repo.investments.create(input);
      return Response.json({ id, account: await repo.investments.get(id) });
    }

    case "update_account": {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return badRequest("id required");
      const input = parseAccountInput(body);
      if (typeof input === "string") return badRequest(input);
      const result = await runOrRespondError(() => repo.investments.update(id, input));
      if (result instanceof Response) return result;
      return Response.json({ account: await repo.investments.get(id) });
    }

    case "set_closed": {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return badRequest("id required");
      if (typeof body.closed !== "boolean") return badRequest("closed must be a boolean");
      const closed = body.closed;
      const result = await runOrRespondError(() => repo.investments.setClosed(id, closed));
      if (result instanceof Response) return result;
      return Response.json({ account: await repo.investments.get(id) });
    }

    case "delete_account": {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return badRequest("id required");
      await repo.investments.delete(id);
      return Response.json({ ok: true });
    }

    case "set_balance": {
      const accountId = Number(body.account_id);
      const balance = Number(body.balance);
      const asOfDate = body.as_of_date;
      if (!Number.isFinite(accountId)) return badRequest("account_id required");
      if (body.balance === null || body.balance === "" || !Number.isFinite(balance) || balance < 0) {
        return badRequest("balance must be a non-negative number");
      }
      if (typeof asOfDate !== "string" || !DATE_RE.test(asOfDate)) {
        return badRequest("as_of_date must be YYYY-MM-DD");
      }
      const result = await runOrRespondError(() =>
        repo.investments.setBalance(accountId, { balance, as_of_date: asOfDate })
      );
      if (result instanceof Response) return result;
      return Response.json({ account: await repo.investments.get(accountId) });
    }

    case "delete_balance": {
      const id = Number(body.id);
      const accountId = Number(body.account_id);
      if (!Number.isFinite(id)) return badRequest("id required");
      if (!Number.isFinite(accountId)) return badRequest("account_id required");
      const result = await runOrRespondError(() => repo.investments.deleteBalance(accountId, id));
      if (result instanceof Response) return result;
      return Response.json({ account: await repo.investments.get(accountId) });
    }

    default:
      return badRequest("Unknown action");
  }
}
