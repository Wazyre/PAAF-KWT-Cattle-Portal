// Client for PACI (Kuwait Mobile ID) push authentication.
//
// Flow: we POST the civil ID to PACI's Auth endpoint, which sends a confirmation request to the person's phone.
// PACI later POSTs the result to our callback (/api/paci/callback) as { CivilID: "<request id>", flag: "True" | "False" }.
// The "CivilID" in that callback is the request identifier PACI gave us in the Auth response, not a civil number.
import { randomUUID } from "node:crypto";

export type PaciStart =
  | { ok: true; requestId: string }
  | { ok: false; kind: "unavailable" | "rejected" };

const DEFAULT_AUTH_URL = "https://kmidinteg.paaf.gov.kw/api/PACI/Auth";
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** "mock" approves automatically (testing only, set PACI_MODE=mock); anything else talks to PACI. */
export function paciMode(): "live" | "mock" {
  return process.env.PACI_MODE === "mock" ? "mock" : "live";
}

/** How long a person has to answer on their phone. */
export function paciTimeoutSeconds(): number {
  const n = Number(process.env.PACI_TIMEOUT_SECONDS);
  return Number.isFinite(n) && n >= 15 ? n : 120;
}

// Text shown to the person inside the PACI app. (PACI spells the field "AuthReasson".)
const REQUEST_TEXT = {
  ServiceDescAr: "تأكيد الدخول إلى المنصة الإلكترونية لحصر ومراجعة بيانات الثروة الحيوانية",
  ServiceDescEn: "Confirm sign-in to the Livestock Declaration and Audit Portal",
  AuthReassonAR: "التحقق من هوية المستخدم لتسجيل الدخول",
  AuthReassonEn: "Verify the user identity to sign in"
};

export async function requestPaciAuth(civilId: string): Promise<PaciStart> {
  if (paciMode() === "mock") return { ok: true, requestId: randomUUID() };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Optional credential header some PACI environments require, e.g. PACI_AUTH_HEADER="Authorization: Bearer abc".
  const extra = process.env.PACI_AUTH_HEADER;
  const split = extra ? extra.indexOf(":") : -1;
  if (extra && split > 0) headers[extra.slice(0, split).trim()] = extra.slice(split + 1).trim();

  let res: Response;
  let body: string;
  try {
    res = await fetch(process.env.PACI_AUTH_URL || DEFAULT_AUTH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ CivilID: civilId, ...REQUEST_TEXT }),
      signal: AbortSignal.timeout(15000)
    });
    body = await res.text();
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    console.error("PACI Auth request failed:", (e as Error).message, cause?.code ?? cause?.message ?? "");
    return { ok: false, kind: "unavailable" };
  }

  if (res.status >= 500 || res.status === 429) {
    console.error(`PACI Auth answered ${res.status}: ${body.slice(0, 200)}`);
    return { ok: false, kind: "unavailable" };
  }
  if (!res.ok) {
    console.error(`PACI Auth refused the request (${res.status}): ${body.slice(0, 200)}`);
    return { ok: false, kind: "rejected" };
  }
  const requestId = body.match(GUID)?.[0];
  if (!requestId) {
    // Without the id PACI will use in its callback we could never match the answer to this sign-in.
    console.error(`PACI Auth answered ${res.status} without a request id: ${body.slice(0, 200)}`);
    return { ok: false, kind: "unavailable" };
  }
  return { ok: true, requestId: requestId.toLowerCase() };
}

/**
 * Mock mode only. Pretends PACI answered after 3 seconds: civil IDs ending in 9 are refused, ending in 8 never
 * answer (to try the timeout), everything else is approved.
 */
export function mockOutcome(civilId: string, createdAt: Date): "approved" | "refused" | null {
  if (Date.now() - createdAt.getTime() < 3000) return null;
  if (civilId.endsWith("8")) return null;
  return civilId.endsWith("9") ? "refused" : "approved";
}
