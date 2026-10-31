// Coordinate parsing from pasted strings / Maps URLs, short-link expansion, and Haversine distance.

export interface LatLng {
  lat: number;
  lng: number;
}

// Reject NaN/Infinity and out-of-range Earth coordinates.
function valid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

// Run one regex against the string and return the first valid lat/lng capture, or null.
function firstMatch(s: string, re: RegExp): LatLng | null {
  const m = s.match(re);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  return valid(lat, lng) ? { lat, lng } : null;
}

/**
 * Parse coordinates out of a pasted location string. Handles:
 *  - "29.123, 47.987"  (plain pair)
 *  - Google Maps "...@29.12,47.98,17z..."
 *  - ".../maps/search/29.35,+47.99" / "/place/.../" / "/dir/..." (expanded
 *    short-link form, where the separator is a URL-encoded space "+"/"%20")
 *  - "...?q=29.12,47.98" / "query=" / "ll=" / "destination=" / "daddr="
 *  - "...!3d29.12!4d47.98" (place data)
 * Returns null for un-expanded short links (maps.app.goo.gl / goo.gl) — those
 * must be expanded server-side first via expandShortLink().
 */
export function parseLatLng(input: string): LatLng | null {
  if (!input) return null;
  const raw = input.trim();

  // A decoded variant turns "%2C"/"%20"/"+" into plain comma/space so the
  // "/search/29.35,+47.99" form (from expanded Google short links) matches.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    decoded = raw.replace(/\+/g, " ");
  }

  const patterns: RegExp[] = [
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /\/(?:search|place|dir)\/(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|destination|center|daddr|saddr)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/
  ];

  for (const s of [raw, decoded]) {
    for (const re of patterns) {
      const hit = firstMatch(s, re);
      if (hit) return hit;
    }
  }
  return null;
}

// Hosts that Google Maps share links are served from. Only these are ever fetched server-side.
const SHORT_LINK_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);

function shortLinkUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.port) return null;
    if (!SHORT_LINK_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.hostname.toLowerCase() === "goo.gl" && !url.pathname.startsWith("/maps")) return null;
    if (url.hostname.toLowerCase() === "g.co" && !url.pathname.startsWith("/kgs")) return null;
    return url;
  } catch {
    return null;
  }
}

// True if the input is a Google Maps short-link that must be expanded server-side before parsing.
export function isShortLink(input: string): boolean {
  return shortLinkUrl(input) !== null;
}

const MAX_REDIRECTS = 5;

/**
 * Follow redirects on a shortened Maps link to recover the full URL.
 * Only the short-link hosts are fetched: each redirect is read, not followed, so a link can never
 * make the server request any other address. The first non-short-link Location is the result.
 */
export async function expandShortLink(url: string): Promise<string | null> {
  let current = shortLinkUrl(url);
  if (!current) return null;
  try {
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000)
      });
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) return current.toString();
      const next = new URL(location, current);
      const nextShort = shortLinkUrl(next.toString());
      if (!nextShort) return next.toString();
      current = nextShort;
    }
    return null;
  } catch {
    return null;
  }
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance between two points, in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
