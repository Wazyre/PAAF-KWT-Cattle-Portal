// Same handler as /api/paci/callback, served at the path PACI's e-services callback uses
// (https://eservices.paaf.gov.kw/paafPortal/resourc/paciCall). Use it if PAAF forwards or routes that path to this portal.
export const dynamic = "force-dynamic";
export { POST } from "@/app/api/paci/callback/route";
