export interface LatLng {
  lat: number;
  lng: number;
}

function valid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Parse coordinates out of a pasted location string. Handles:
 *  - "29.123, 47.987"  (plain pair)
 *  - Google Maps "...@29.12,47.98,17z..."
 *  - "...?q=29.12,47.98" / "query=" / "ll=" / "destination="
 *  - "...!3d29.12!4d47.98" (place data)
 * Returns null for short links (maps.app.goo.gl / goo.gl) — those must be
 * expanded server-side first via expandShortLink().
 */
export function parseLatLng(input: string): LatLng | null {
  if (!input) return null;
  const s = input.trim();

  const pair = /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;

  const at = s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (at) {
    const lat = parseFloat(at[1]);
    const lng = parseFloat(at[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  const d = s.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (d) {
    const lat = parseFloat(d[1]);
    const lng = parseFloat(d[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  const q = s.match(/(?:[?&](?:q|query|ll|destination|center)=)(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (q) {
    const lat = parseFloat(q[1]);
    const lng = parseFloat(q[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  const m = s.match(pair);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  return null;
}

export function isShortLink(input: string): boolean {
  return /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(input);
}

/** Follow redirects on a shortened Maps link to recover the full URL. */
export async function expandShortLink(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    return res.url || null;
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
