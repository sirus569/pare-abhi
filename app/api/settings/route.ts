import { NextRequest } from "next/server";
import { getScopedRepo, unauthorized } from "@/lib/repo/scoped";
import { isCurrency, CURRENCIES } from "@/lib/currency";

// User preferences (lib/db/settings.ts, migration 017). Today: the single
// display currency. Both deploy targets — the repo is the caller's own DB/DO.

export async function GET(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();
  return Response.json(await repo.settings.get());
}

export async function POST(request: NextRequest) {
  const repo = await getScopedRepo(request);
  if (!repo) return unauthorized();

  let body: { currency?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isCurrency(body.currency)) {
    return Response.json(
      { error: `currency must be one of ${CURRENCIES.join(", ")}` },
      { status: 400 }
    );
  }
  await repo.settings.setCurrency(body.currency);
  return Response.json(await repo.settings.get());
}
