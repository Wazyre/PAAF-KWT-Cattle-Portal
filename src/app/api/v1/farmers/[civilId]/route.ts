// GET /api/v1/farmers/{civilId}: is this a first declaration or an update, and may the farmer submit right now?
import { LEGAL_VERSION } from "@/lib/legal";
import { etagOf, farmerStatus, latestAcceptance, requireFarmer } from "@/lib/api/declaration";
import { civilIdParam, jsonResponse, withApi } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = withApi<{ civilId: string }>(async (_req, params) => {
  const civilId = civilIdParam(params.civilId);
  const identity = await requireFarmer(civilId);
  const [status, acceptance] = await Promise.all([farmerStatus(civilId), latestAcceptance(civilId)]);
  const d = status.declaration;

  return jsonResponse(
    {
      civilId: identity.civilId,
      name: identity.name,
      mode: status.mode,
      allowed: status.allowed,
      blockedReason: status.blockedReason,
      transactionId: d?.id ?? null,
      createdAt: d?.createdAt.toISOString() ?? null,
      updatedAt: d?.updatedAt.toISOString() ?? null,
      legal: {
        currentVersion: LEGAL_VERSION,
        acceptanceRequired: status.mode === "NEW",
        acceptedVersion: acceptance?.version ?? null,
        acceptedAt: acceptance?.acceptedAt.toISOString() ?? null
      }
    },
    200,
    d ? { ETag: etagOf(d) } : {}
  );
});
