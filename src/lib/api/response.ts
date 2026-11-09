// JSON responses and errors for the declaration API (/api/v1). Every error has the same shape:
//   { "error": { "code": "...", "message": "...", "messageAr": "...", "details": [{ "path", "code", "message" }] } }
// `code` is stable and meant for programs, `message` is English for developers, `messageAr` is the wording the farmer
// portal shows, ready to display to a farmer.
import { NextResponse } from "next/server";
import { authenticate, type ApiClientIdentity } from "./auth";
import { ApiFailure } from "./errors";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function errorResponse(e: ApiFailure): Response {
  return jsonResponse(
    { error: { code: e.code, message: e.message, ...(e.messageAr ? { messageAr: e.messageAr } : {}), ...(e.details ? { details: e.details } : {}) } },
    e.status
  );
}

const MAX_BODY_BYTES = 1024 * 1024;

/** The request body as JSON; rejects an empty, oversized or malformed body. */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new ApiFailure(413, "BODY_TOO_LARGE", "The request body is larger than 1 MB.");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiFailure(413, "BODY_TOO_LARGE", "The request body is larger than 1 MB.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiFailure(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

export const CIVIL_ID_RE = /^\d{12}$/;

/** A civil ID from the URL, or a 400. */
export function civilIdParam(value: string): string {
  if (!CIVIL_ID_RE.test(value)) {
    throw new ApiFailure(400, "INVALID_CIVIL_ID", "The civil ID must be exactly 12 digits.", "الرقم المدني يجب أن يتكوّن من 12 رقماً.");
  }
  return value;
}

type Handler<P> = (req: Request, params: P, client: ApiClientIdentity) => Promise<Response>;

/**
 * Wraps a route handler: checks the API key first, turns thrown ApiFailures into JSON errors, and turns anything
 * unexpected into a plain 500 (the real error goes to the server log, never to the caller).
 */
export function withApi<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx?: { params: Promise<P> }): Promise<Response> => {
    try {
      const client = await authenticate(req);
      const params = ctx ? await ctx.params : ({} as P);
      return await handler(req, params, client);
    } catch (e) {
      if (e instanceof ApiFailure) return errorResponse(e);
      console.error("[api] unexpected error", e);
      return errorResponse(new ApiFailure(500, "INTERNAL_ERROR", "Something went wrong on the server."));
    }
  };
}
