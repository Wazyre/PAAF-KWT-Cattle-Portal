// GET endpoint that turns a pasted location string or Maps short-link into {lat, lng}.
import { NextRequest, NextResponse } from "next/server";
import { parseLatLng, isShortLink, expandShortLink } from "@/lib/geo";

// Parses lat/lng directly, or expands a short-link first; returns 400 if missing, 422 if unresolved.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u")?.trim() ?? "";
  if (!u) return NextResponse.json({ error: "missing" }, { status: 400 });

  let direct = parseLatLng(u);
  if (direct) return NextResponse.json(direct);

  if (isShortLink(u)) {
    const expanded = await expandShortLink(u);
    if (expanded) {
      direct = parseLatLng(expanded);
      if (direct) return NextResponse.json(direct);
    }
  }

  return NextResponse.json({ error: "unresolved" }, { status: 422 });
}
