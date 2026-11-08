// Signed sign-in links for Sahel notifications: https://<portal>/?c=<civil id>&k=<signature>.
//
// The link carries the civil ID so the person does not have to type it; the signature (an HMAC of the civil ID made with
// ENTRY_LINK_SECRET) stops anyone from writing a link for a civil ID of their choice. Opening a link only starts the usual
// PACI request: the person still has to approve it on their phone. Links do not expire; rotate the secret to revoke all of them.
import { createHmac, timingSafeEqual } from "node:crypto";

export function entryLinkSecret(): string | null {
  return process.env.ENTRY_LINK_SECRET?.trim() || null;
}

export function signEntryLink(civilId: string, secret: string): string {
  return createHmac("sha256", secret).update(`entry:${civilId}`).digest("base64url").slice(0, 22);
}

/** Whether `signature` is the signature of `civilId`. False when links are not set up (no secret). */
export function verifyEntryLink(civilId: string, signature: string): boolean {
  const secret = entryLinkSecret();
  if (!secret || !/^\d{12}$/.test(civilId)) return false;
  const expected = Buffer.from(signEntryLink(civilId, secret));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** "selfdeclaration.paaf.gov.kw" or "http://host:3000/" -> "https://selfdeclaration.paaf.gov.kw" (the scheme defaults to https). */
export function normalizeBase(base: string): string {
  const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
  return withScheme.replace(/\/+$/, "");
}

export function entryLinkUrl(base: string, civilId: string, secret: string): string {
  return `${normalizeBase(base)}/?c=${civilId}&k=${signEntryLink(civilId, secret)}`;
}
