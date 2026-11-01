// POST /api/paci/callback: PACI reports the person's answer as { "CivilID": "<request id>", "flag": "True" | "False" }.
// This URL must be registered with PACI and reachable from PACI's network. If PACI_CALLBACK_SECRET is set, the
// registered URL must carry it as ?key=... (or send it in an x-paci-key header).
// Every call is logged (never the secret or the full request id) so a missing or malformed callback is visible.
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

// JSON is expected, but a form-encoded body is accepted too in case PACI sends one.
function parseBody(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // not JSON
  }
  const form = Object.fromEntries(new URLSearchParams(text));
  return Object.keys(form).length > 0 ? form : null;
}

export async function POST(req: Request) {
  const from = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "direct";
  if (!secretMatches(req)) {
    console.warn(`PACI callback REJECTED (wrong or missing key) from ${from}.`);
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const text = await req.text();
  const body = parseBody(text);
  if (!body) {
    console.warn(`PACI callback with an unreadable body (${text.length} bytes, content-type "${req.headers.get("content-type")}") from ${from}.`);
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const requestId = String(body.CivilID ?? body.civilID ?? body.civilId ?? body.RequestID ?? body.requestId ?? "").trim();
  const flag = String(body.flag ?? body.Flag ?? "").trim().toLowerCase();
  if (!requestId) {
    console.warn(`PACI callback without a request id from ${from}; fields received: ${Object.keys(body).join(", ")}.`);
    return NextResponse.json({ error: "missing request id" }, { status: 400 });
  }

  const matched = await applyPaciResult(requestId, flag === "true");
  console.log(`PACI callback from ${from}: request ${requestId.slice(0, 8)}…, flag "${flag}" -> ${matched ? "matched a waiting sign-in" : "no waiting sign-in with that id (unknown, already settled, or expired)"}.`);
  // Always answer 200 for a well-formed call so PACI does not retry something we have already settled.
  return NextResponse.json({ ok: true });
}
