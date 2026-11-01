// GET /api/auth/status?attempt=<token>: where a sign-in stands. On approval it sets the session cookie, exactly once.
import { NextResponse } from "next/server";
import { attemptStatus, consumeApproval } from "@/lib/login";
import { OUTCOME_ERRORS } from "@/lib/login-messages";
import { startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("attempt") ?? "";
  const noStore = { "Cache-Control": "no-store" };
  if (!token) return NextResponse.json({ status: "UNKNOWN", message: OUTCOME_ERRORS.UNKNOWN }, { status: 400, headers: noStore });

  let status = await attemptStatus(token);
  if (status === "APPROVED") {
    const who = await consumeApproval(token);
    if (!who) {
      // Approved, but this token was already used (or the person was removed meanwhile).
      status = "EXPIRED";
    } else {
      await startSession(who);
      return NextResponse.json({ status: "APPROVED", name: who.name, roles: who.roles }, { headers: noStore });
    }
  }
  return NextResponse.json({ status, message: OUTCOME_ERRORS[status] }, { headers: noStore });
}
