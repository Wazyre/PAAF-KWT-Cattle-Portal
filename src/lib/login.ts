// The sign-in state machine behind the entryway page: start a PACI request, record PACI's answer, and turn an approval into a session.
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { CIVIL_ID_PATTERN, rolesFor, type Role } from "./roles";
import { mockOutcome, paciMode, paciTimeoutSeconds, requestPaciAuth } from "./paci";

export type StartResult =
  | { ok: true; attempt: string; expiresIn: number }
  | { ok: false; code: "invalid" | "not_registered" | "rate_limited" | "too_soon" | "paci_unavailable" | "paci_rejected" };

// A phone gets one push at a time: asking again within this window is refused (stops anyone from spamming a citizen's phone).
const COOLDOWN_SECONDS = 30;

// At most this many sign-in starts per client address in the window (in memory; resets on restart).
const RATE_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 };
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [key, times] of hits) if (times.every((t) => now - t >= RATE_LIMIT.windowMs)) hits.delete(key);
  return recent.length > RATE_LIMIT.max;
}

export async function startLogin(rawCivilId: string, ip: string): Promise<StartResult> {
  const civilId = rawCivilId.trim();
  if (!CIVIL_ID_PATTERN.test(civilId)) return { ok: false, code: "invalid" };
  if (rateLimited(ip)) return { ok: false, code: "rate_limited" };

  // Unknown IDs are turned away before PACI is contacted, so no push goes to someone who cannot use the portal.
  if (!(await rolesFor(civilId))) return { ok: false, code: "not_registered" };

  const since = new Date(Date.now() - COOLDOWN_SECONDS * 1000);
  const open = await prisma.loginAttempt.findFirst({ where: { civilId, status: "PENDING", createdAt: { gt: since } } });
  if (open) return { ok: false, code: "too_soon" };
  await prisma.loginAttempt.updateMany({ where: { civilId, status: "PENDING" }, data: { status: "EXPIRED", detail: "superseded" } });

  const expiresIn = paciTimeoutSeconds();
  const attempt = randomBytes(24).toString("base64url");
  await prisma.loginAttempt.create({
    data: { id: attempt, civilId, expiresAt: new Date(Date.now() + expiresIn * 1000) }
  });

  const paci = await requestPaciAuth(civilId);
  if (!paci.ok) {
    await prisma.loginAttempt.update({ where: { id: attempt }, data: { status: "FAILED", detail: paci.kind } });
    return { ok: false, code: paci.kind === "rejected" ? "paci_rejected" : "paci_unavailable" };
  }
  await prisma.loginAttempt.update({ where: { id: attempt }, data: { paciRequestId: paci.requestId } });
  return { ok: true, attempt, expiresIn };
}

/** Called with PACI's answer. Returns false when the request id is unknown or already settled. */
export async function applyPaciResult(requestId: string, approved: boolean): Promise<boolean> {
  const done = await prisma.loginAttempt.updateMany({
    where: { paciRequestId: requestId.toLowerCase(), status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: approved ? "APPROVED" : "REFUSED" }
  });
  return done.count === 1;
}

export type AttemptStatus = "PENDING" | "APPROVED" | "REFUSED" | "EXPIRED" | "FAILED" | "UNKNOWN";

/** What the browser's polling sees. In mock mode this is also where the pretend PACI answer arrives. */
export async function attemptStatus(token: string): Promise<AttemptStatus> {
  const attempt = await prisma.loginAttempt.findUnique({ where: { id: token } });
  if (!attempt) return "UNKNOWN";
  if (attempt.status !== "PENDING") return attempt.status;

  if (paciMode() === "mock" && attempt.paciRequestId) {
    const outcome = mockOutcome(attempt.civilId, attempt.createdAt);
    if (outcome) {
      await applyPaciResult(attempt.paciRequestId, outcome === "approved");
      return outcome === "approved" ? "APPROVED" : "REFUSED";
    }
  }
  if (attempt.expiresAt.getTime() <= Date.now()) {
    await prisma.loginAttempt.updateMany({ where: { id: token, status: "PENDING" }, data: { status: "EXPIRED", detail: "timeout" } });
    return "EXPIRED";
  }
  return "PENDING";
}

/** Exchanges an approved attempt for the person's identity, exactly once. */
export async function consumeApproval(token: string): Promise<{ civilId: string; name: string; roles: Role[] } | null> {
  const attempt = await prisma.loginAttempt.findUnique({ where: { id: token } });
  if (!attempt || attempt.status !== "APPROVED") return null;
  const claimed = await prisma.loginAttempt.updateMany({ where: { id: token, status: "APPROVED", consumed: false }, data: { consumed: true } });
  if (claimed.count !== 1) return null;
  const who = await rolesFor(attempt.civilId);
  return who ? { civilId: attempt.civilId, ...who } : null;
}

/** Same-origin check for browser POSTs: the Origin header must name this site (or an ALLOWED_ORIGINS entry). Requests without one are not browsers. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = [req.headers.get("x-forwarded-host")?.split(",")[0].trim(), req.headers.get("host"), new URL(req.url).host];
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return own.includes(host) || allowed.includes(host);
}

export function clientAddress(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
