// GET /api/v1/locations/resolve?link=...: turns a pasted "lat, lng" or a Google Maps link (including share links)
// into coordinates, the same helper the farmer form uses to put the pin on the map.
import { resolveLocation } from "@/lib/geo";
import { ApiFailure } from "@/lib/api/errors";
import { jsonResponse, withApi } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => {
  const link = new URL(req.url).searchParams.get("link")?.trim() ?? "";
  if (!link) throw new ApiFailure(400, "LINK_REQUIRED", "Give the location in the 'link' query parameter.");
  if (link.length > 2048) throw new ApiFailure(400, "LINK_TOO_LONG", "The link is longer than 2048 characters.");
  const found = await resolveLocation(link);
  if (!found) {
    throw new ApiFailure(
      422,
      "LOCATION_UNRESOLVED",
      "No coordinates could be read from the link.",
      "تعذّر استخراج الإحداثيات من الرابط. تأكّد من الرابط أو أدخل الإحداثيات بصيغة 29.1234, 47.9876"
    );
  }
  return jsonResponse({ latitude: found.lat, longitude: found.lng });
});
