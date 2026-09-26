import { NextRequest } from "next/server";
import { getScopedRepo, unauthorized } from "@/lib/repo/scoped";
import { isFlow } from "@/lib/transaction-types";

// Keyword → transaction-type rules (lib/db/transaction-types.ts).
//   GET                    → { rules }
//   GET ?preview=<keyword> → { count, manual, samples } — what a rule would match
//   POST { keyword, flow } → { typed } — adds the rule, re-derives types, re-categorizes
//   DELETE ?id=<id>        → { typed }
export async function GET(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();
  const preview = request.nextUrl.searchParams.get("preview");
  if (preview !== null) return Response.json(await repo.transactionTypes.preview(preview));
  return Response.json({ rules: await repo.transactionTypes.listRules() });
}

export async function POST(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  if (!keyword || keyword.length > 100 || !isFlow(body.flow)) {
    return Response.json({ error: "keyword and a valid flow required" }, { status: 400 });
  }
  try {
    return Response.json(await repo.transactionTypes.addRule(keyword, body.flow));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to add rule" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "id required" }, { status: 400 });
  return Response.json(await repo.transactionTypes.deleteRule(id));
}
