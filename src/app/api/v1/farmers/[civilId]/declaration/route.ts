// GET /api/v1/farmers/{civilId}/declaration: the stored declaration (to prefill an edit form).
// PUT /api/v1/farmers/{civilId}/declaration: create the declaration, or replace it when one exists.
import {
  assertOpen,
  checkLegal,
  etagOf,
  farmerStatus,
  findDeclaration,
  parseDeclaration,
  requireFarmer,
  saveDeclaration,
  toApiDeclaration
} from "@/lib/api/declaration";
import { ApiFailure } from "@/lib/api/errors";
import { civilIdParam, jsonResponse, readJson, withApi } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = withApi<{ civilId: string }>(async (_req, params) => {
  const civilId = civilIdParam(params.civilId);
  const declaration = await findDeclaration(civilId);
  if (!declaration) {
    throw new ApiFailure(404, "DECLARATION_NOT_FOUND", "This civil ID has no declaration yet.", "لا يوجد إقرار مسجّل لهذا الرقم المدني.");
  }
  return jsonResponse(toApiDeclaration(declaration), 200, { ETag: etagOf(declaration) });
});

export const PUT = withApi<{ civilId: string }>(async (req, params, client) => {
  const civilId = civilIdParam(params.civilId);
  const identity = await requireFarmer(civilId);

  // Same order as the farmer portal: the switches first, then the contents.
  const status = await farmerStatus(civilId);
  assertOpen(status);
  const data = await parseDeclaration(await readJson(req));
  checkLegal(status.mode, data.legalVersion);

  const { kind, declaration } = await saveDeclaration({
    identity,
    data,
    client,
    mode: status.mode,
    ifMatch: req.headers.get("if-match"),
    ifNoneMatch: req.headers.get("if-none-match")
  });

  return jsonResponse(
    { result: kind, transactionId: declaration.id, declaration: toApiDeclaration(declaration) },
    kind === "CREATED" ? 201 : 200,
    { ETag: etagOf(declaration), ...(kind === "CREATED" ? { Location: `/api/v1/farmers/${civilId}/declaration` } : {}) }
  );
});
