// POST /api/paci/callback: PACI reports the person's answer as { "CivilID": "<request id>", "flag": "True" | "False" }.
// This URL must be registered with PACI and reachable from PACI's network. If PACI_CALLBACK_SECRET is set, the
// registered URL must carry it as ?key=... (or send it in an x-paci-key header).
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyPaciResult } from "@/lib/login";

export const dynamic = "force-dynamic";

function secretMatches(req: Request): boolean {
  const expected = process.env.PACI_CALLBACK_SECRET;
  if (!expected) return true;
  const given = new URL(req.url).searchParams.get("key") ?? req.headers.get("x-paci-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretMatches(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const requestId = String(body.CivilID ?? body.civilID ?? body.civilId ?? body.RequestID ?? body.requestId ?? "").trim();
  const flag = String(body.flag ?? body.Flag ?? "").trim().toLowerCase();
  if (!requestId) return NextResponse.json({ error: "missing request id" }, { status: 400 });

  const matched = await applyPaciResult(requestId, flag === "true");
  if (!matched) console.warn(`PACI callback for an unknown, settled or expired request (${requestId.slice(0, 8)}...)`);
  // Always answer 200 for a well-formed call so PACI does not retry something we have already settled.
  return NextResponse.json({ ok: true });
}
