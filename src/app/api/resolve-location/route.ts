// GET endpoint that turns a pasted location string or Maps short-link into {lat, lng}.
import { NextRequest, NextResponse } from "next/server";
import { resolveLocation } from "@/lib/geo";
import { authorize } from "@/lib/session";

// Parses lat/lng directly, or expands a short-link first; returns 400 if missing, 422 if unresolved.
export async function GET(req: NextRequest) {
  // Fetches Google links on the caller's behalf, so only signed-in portal users may use it.
  if (!(await authorize("FARMER", "SUPERVISOR", "HEAD"))) {
    return NextResponse.json({ error: "not authorised" }, { status: 401 });
  }
  const u = req.nextUrl.searchParams.get("u")?.trim() ?? "";
  if (!u) return NextResponse.json({ error: "missing" }, { status: 400 });

  const found = await resolveLocation(u);
  if (found) return NextResponse.json(found);

  return NextResponse.json({ error: "unresolved" }, { status: 422 });
}
