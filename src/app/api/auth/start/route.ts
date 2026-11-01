// POST /api/auth/start { civilId }: sends a PACI confirmation request and returns the attempt token to poll with.
import { NextResponse } from "next/server";
import { clientAddress, isSameOrigin, startLogin } from "@/lib/login";
import { START_ERRORS } from "@/lib/login-messages";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  invalid: 400,
  not_registered: 404,
  rate_limited: 429,
  too_soon: 429,
  paci_unavailable: 503,
  paci_rejected: 502,
  paci_no_identity: 422
};

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    console.warn(`Sign-in refused: Origin "${req.headers.get("origin")}" does not match host "${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}". Set ALLOWED_ORIGINS or pass the Host header through.`);
    return NextResponse.json({ error: "forbidden", message: START_ERRORS.forbidden }, { status: 403 });
  }

  let civilId = "";
  try {
    civilId = String((await req.json())?.civilId ?? "");
  } catch {
    // falls through to "invalid"
  }

  let result;
  try {
    result = await startLogin(civilId, clientAddress(req));
  } catch (e) {
    // Most often the database has not been updated (run `npm run db:push`) or is unreachable.
    console.error("Sign-in start failed:", e);
    // P2021 / P2022: a table or column the code expects is missing, i.e. the schema was not pushed after an update.
    const outdated = ["P2021", "P2022"].includes((e as { code?: string }).code ?? "");
    if (outdated) console.error("The database schema is out of date. Run `npm run db:push` (the launchers and the Windows service do this on every start).");
    const code = outdated ? "schema_outdated" : "server_error";
    return NextResponse.json({ error: code, message: START_ERRORS[code] }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: START_ERRORS[result.code] }, { status: STATUS[result.code] ?? 400 });
  }
  return NextResponse.json({ attempt: result.attempt, expiresIn: result.expiresIn }, { headers: { "Cache-Control": "no-store" } });
}
