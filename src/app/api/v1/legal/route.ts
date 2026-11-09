// GET /api/v1/legal: the legal text a farmer must accept before a first declaration, with its version.
import { LEGAL_CONFIRMATION, LEGAL_HEADING, LEGAL_SECTIONS, LEGAL_VERSION } from "@/lib/legal";
import { legalTextHash } from "@/lib/api/declaration";
import { jsonResponse, withApi } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = withApi(async () =>
  jsonResponse({
    version: LEGAL_VERSION,
    textHash: legalTextHash(),
    heading: LEGAL_HEADING,
    sections: LEGAL_SECTIONS,
    confirmation: LEGAL_CONFIRMATION
  })
);
