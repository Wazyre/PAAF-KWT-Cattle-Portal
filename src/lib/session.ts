// Signed-cookie sessions. The cookie holds the civil ID, name and roles, signed with HMAC-SHA256, and expires after 8 hours.
// Every guard re-reads the roles from the database, so removing someone from a table takes effect immediately.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { rolesFor, type Role } from "./roles";

export const SESSION_COOKIE = "sheep_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;

export interface Session {
  civilId: string;
  name: string;
  roles: Role[];
}

let cachedSecret: string | undefined;

// SESSION_SECRET if set; otherwise a random key generated once and kept in the database so restarts keep everyone signed in.
async function signingKey(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const find = () => prisma.appSecret.findUnique({ where: { key: "session" } });
  let row = await find();
  if (!row) {
    try {
      await prisma.appSecret.create({ data: { key: "session", value: randomBytes(32).toString("base64url") } });
    } catch {
      // another request created it first
    }
    row = await find();
  }
  if (!row) throw new Error("Could not create the session signing key.");
  return (cachedSecret = row.value);
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

async function encode(session: Session): Promise<string> {
  const payload = Buffer.from(
    JSON.stringify({ c: session.civilId, n: session.name, r: session.roles, e: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS })
  ).toString("base64url");
  return `${payload}.${sign(payload, await signingKey())}`;
}

async function decode(token: string): Promise<Session | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, await signingKey()));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.e !== "number" || data.e < Date.now() / 1000) return null;
    if (typeof data.c !== "string" || typeof data.n !== "string" || !Array.isArray(data.r)) return null;
    return { civilId: data.c, name: data.n, roles: data.r as Role[] };
  } catch {
    return null;
  }
}

/** The signed-in person according to the cookie alone (no database role check): fine for showing a name, not for access control. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? decode(token) : null;
}

export async function startSession(session: Session): Promise<void> {
  const h = await headers();
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : h.get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_COOKIE, await encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The session if the person is signed in AND still holds one of the allowed roles in the database; otherwise null. */
export async function authorize(...allowed: Role[]): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  const current = await rolesFor(session.civilId);
  const roles = (current?.roles ?? []).filter((r) => session.roles.includes(r));
  if (!allowed.some((r) => roles.includes(r))) return null;
  return { civilId: session.civilId, name: current!.name, roles };
}

/** For pages and server actions: the authorised session, or a redirect to the entryway. */
export async function requireRole(...allowed: Role[]): Promise<Session> {
  const session = await authorize(...allowed);
  if (!session) redirect((await getSession()) ? "/?reason=denied" : "/?reason=signin");
  return session;
}
