// GET /api/v1/openapi.json: the OpenAPI description of the declaration API. Public: it describes the API, it does not expose data.
import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(openApiSpec());
}
