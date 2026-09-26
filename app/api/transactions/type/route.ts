import { NextRequest } from "next/server";
import { getScopedRepo, unauthorized } from "@/lib/repo/scoped";
import { isFlow } from "@/lib/transaction-types";

// Hand-set one transaction's type (pins it — type rules skip it), or reset it
// back to automatic (a matching type rule, else the imported type). Both re-run
// category rules, since which categories may apply depends on the type.
//   POST   { transaction_id, flow } → { success }
//   DELETE ?transaction_id=<id>     → { success }
export async function POST(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const id = Number(body.transaction_id);
  if (!Number.isInteger(id) || !isFlow(body.flow)) {
    return Response.json({ error: "transaction_id and a valid flow required" }, { status: 400 });
  }
  if (!(await repo.transactionTypes.set(id, body.flow))) {
    return Response.json({ error: "transaction not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();
  const id = Number(request.nextUrl.searchParams.get("transaction_id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "transaction_id required" }, { status: 400 });
  }
  if (!(await repo.transactionTypes.reset(id))) {
    return Response.json({ error: "transaction not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
