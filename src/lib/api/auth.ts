// API keys for the declaration API. A key is "shp_" + 43 random characters, sent as `Authorization: Bearer <key>`.
// Only its SHA-256 hash is stored (keys are random, so no salt is needed), and a key can be revoked at any time with
// `npm run api:clients`; a revoked key stops working on the next request.
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma";
import { ApiFailure } from "./errors";

export const API_KEY_PREFIX = "shp_";

export interface ApiClientIdentity {
  id: number;
  name: string;
}

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

// lastUsedAt is only for the operator ("is this key still in use?"), so it is written at most once a minute per key.
const lastTouched = new Map<number, number>();
const TOUCH_EVERY_MS = 60_000;

/** The client that owns the request's key, or an ApiFailure(401). */
export async function authenticate(req: Request): Promise<ApiClientIdentity> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) {
    throw new ApiFailure(401, "UNAUTHENTICATED", "Send your API key as 'Authorization: Bearer <key>'.");
  }
  const client = await prisma.apiClient.findUnique({ where: { keyHash: hashApiKey(match[1]) } });
  if (!client || client.revokedAt) {
    throw new ApiFailure(401, "INVALID_API_KEY", "The API key is not valid or has been revoked.");
  }
  const now = Date.now();
  if (now - (lastTouched.get(client.id) ?? 0) > TOUCH_EVERY_MS) {
    lastTouched.set(client.id, now);
    prisma.apiClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date(now) } }).catch(() => {});
  }
  return { id: client.id, name: client.name };
}
