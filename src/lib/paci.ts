// Client for PACI (Kuwait Mobile ID) push authentication.
//
// Flow: we POST the civil ID to PACI's Auth endpoint, which sends a confirmation request to the person's phone.
// The answer reaches us in one of two ways, both of which settle the same waiting sign-in:
//  - PACI's result is posted to our callback (/api/paci/callback) as { CivilID: "<request id>", flag: "True" | "False" }
//    (only if PAAF registers that address; the e-services portal is where PACI posts today), or
//  - we ask PAAF's e-services check (paciCall) about the request id every few seconds (checkPaciResult below).
// The "CivilID" in the callback and in the check is the request id PACI returned as SubmitResult, not a civil number.
import { randomUUID } from "node:crypto";
import { postJson } from "./http";

export type PaciStart =
  | { ok: true; requestId: string }
  | { ok: false; kind: "unavailable" | "rejected" | "no_identity" };

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

const DEFAULT_RESULT_URL = "https://eservices.paaf.gov.kw/paafPortal/resourc/paciCall";

/** Whether to ask e-services for the result while a sign-in waits. Set PACI_RESULT_POLL=off to rely on the callback only. */
export function resultPollingEnabled(): boolean {
  return paciMode() === "live" && (process.env.PACI_RESULT_POLL ?? "").toLowerCase() !== "off";
}

export type PaciResult =
  | { state: "approved" }
  | { state: "pending" }
  | { state: "error"; detail: string };

/**
 * Asks e-services whether the person approved the request: POST { CivilID: <request id>, flag: "True" } answers
 * CallBackResSuccessFlag "True" only after PACI reported an approval; for pending or unknown ids it answers "False".
 * (Verified with a probe: a random id gets "False", a real request flips to "True" when approved.)
 */
export async function checkPaciResult(requestId: string): Promise<PaciResult> {
  let reply;
  try {
    reply = await postJson(process.env.PACI_RESULT_URL || DEFAULT_RESULT_URL, { CivilID: requestId, flag: "True" });
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { state: "error", detail: `${(e as Error).message}${code ? ` (${code})` : ""}` };
  }
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(reply.text);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // handled below
  }
  const flag = String(body.CallBackResSuccessFlag ?? "").trim().toLowerCase();
  const error = String(body.CallBackResSuccessError ?? "").trim();
  if (reply.status === 200 && flag === "true") return { state: "approved" };
  if (reply.status === 200 && flag === "false" && (error === "" || error.toLowerCase() === "null")) return { state: "pending" };
  if (error === "FORBIDDEN_SOURCE" || reply.status === 403) {
    return { state: "error", detail: "e-services refused this server's address (FORBIDDEN_SOURCE): ask PAAF to allow it" };
  }
  return { state: "error", detail: `unexpected reply HTTP ${reply.status}: ${reply.text.replace(/\s+/g, " ").slice(0, 120)}` };
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

  // PACI's reply: { SubmitResult, HasIdentity, Erorr, CivilID } ("Erorr" is PACI's spelling). When the request is submitted,
  // SubmitResult holds the request id (a GUID): the value the callback later echoes in its own CivilID field.
  let reply: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object") reply = parsed as Record<string, unknown>;
  } catch {
    // not JSON: fall back to looking for an id anywhere in the text
  }
  const isFalse = (v: unknown) => v === false || (typeof v === "string" && v.trim().toLowerCase() === "false");
  const problem = reply.Erorr ?? reply.Error ?? reply.error;
  // The request id doubles as the callback's password, so it is never logged in full.
  const show = (v: unknown) => (typeof v === "string" && GUID.test(v) ? `${v.slice(0, 8)}…` : String(v));
  const summary = `SubmitResult=${show(reply.SubmitResult)}, HasIdentity=${show(reply.HasIdentity)}${problem ? `, Erorr="${String(problem).slice(0, 120)}"` : ""}`;

  if (isFalse(reply.HasIdentity)) {
    console.error(`PACI Auth: this civil ID has no digital identity (${summary}).`);
    return { ok: false, kind: "no_identity" };
  }
  if (isFalse(reply.SubmitResult)) {
    console.error(`PACI Auth did not submit the request (${summary}).`);
    return { ok: false, kind: "rejected" };
  }

  const fields = ["SubmitResult", "CivilID", "CiviID", "RequestID", "requestId"] as const;
  const source = fields.find((f) => typeof reply[f] === "string" && GUID.test(reply[f] as string));
  const requestId = source ? (reply[source] as string).match(GUID)![0] : body.match(GUID)?.[0];
  if (!requestId) {
    // Without the id PACI will use in its callback we could never match the answer to this sign-in.
    console.error(`PACI Auth answered ${res.status} without a request id (${summary}).`);
    return { ok: false, kind: "unavailable" };
  }
  console.log(`PACI Auth accepted (HTTP ${res.status}; ${summary}); request id ${requestId.slice(0, 8)}… taken from ${source ? `the ${source} field` : "the reply text"}. Now waiting for the result (callback, or the e-services check).`);
  return { ok: true, requestId: requestId.toLowerCase() };
}

/**
 * Mock mode only. Pretends PACI answered after 3 seconds: civil IDs ending in 9 are refused, ending in 8 never
 * answer (to try the timeout), everything else is approved.
 */
export function mockOutcome(civilId: string, createdAt: Date): "approved" | "refused" | null {
  const configured = process.env.PACI_MOCK_DELAY_SECONDS;  // lets a load test imitate people taking longer to approve
  const delay = configured && Number(configured) >= 0 ? Number(configured) : 3;
  if (Date.now() - createdAt.getTime() < delay * 1000) return null;
  if (civilId.endsWith("8")) return null;
  return civilId.endsWith("9") ? "refused" : "approved";
}
