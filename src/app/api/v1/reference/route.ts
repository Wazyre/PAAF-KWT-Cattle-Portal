// GET /api/v1/reference: the lists and limits the farmer form is built from, so an outside form never hard-codes them.
import { ANIMAL_TYPES, GATHERING_POINTS, LOW_HEAD_THRESHOLD, MIN_SITE_DISTANCE_METERS } from "@/lib/constants";
import { MAX_COUNT, MAX_LOCATIONS_PER_ANIMAL_TYPE } from "@/lib/api/declaration";
import { KUWAIT_MOBILE_ERROR, KUWAIT_MOBILE_RE } from "@/lib/phone";
import { jsonResponse, withApi } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = withApi(async () =>
  jsonResponse({
    animalTypes: ANIMAL_TYPES,
    gatheringPoints: GATHERING_POINTS,
    rules: {
      mobilePattern: KUWAIT_MOBILE_RE.source,
      mobileMessage: KUWAIT_MOBILE_ERROR,
      minSiteDistanceMeters: MIN_SITE_DISTANCE_METERS,
      maxLocationsPerAnimalType: MAX_LOCATIONS_PER_ANIMAL_TYPE,
      maxCount: MAX_COUNT,
      lowHeadThreshold: LOW_HEAD_THRESHOLD
    }
  })
);
