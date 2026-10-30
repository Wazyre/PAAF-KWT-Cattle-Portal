// GET /api/export/<macro>: downloads one of the CSV exports defined in src/lib/exports.ts.
import { NextResponse } from "next/server";
import { buildCsv, exportFilename, findMacro } from "@/lib/exports";

export const dynamic = "force-dynamic";

// Streams the requested export as an attachment; 404 for an unknown macro name.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ macro: string }> }
) {
  const { macro: macroName } = await params;
  const macro = findMacro(macroName);
  if (!macro) {
    return NextResponse.json({ error: "unknown export" }, { status: 404 });
  }
  const csv = await buildCsv(macro);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(macro.key)}"`,
      "Cache-Control": "no-store"
    }
  });
}
