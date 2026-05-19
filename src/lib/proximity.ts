import { prisma } from "./prisma";
import { distanceMeters } from "./geo";
import { PROXIMITY_METERS } from "./constants";

export interface ProximityHit {
  distance: number;
  thisLocationIndex: number;
  otherName: string;
  otherCivilId: string;
  otherDeclarationId: number;
  otherLat: number;
  otherLng: number;
  thisLat: number;
  thisLng: number;
}

/**
 * Find farm locations belonging to OTHER declarations that sit within
 * PROXIMITY_METERS of any location in the given declaration.
 */
export async function findProximityHits(
  declarationId: number
): Promise<ProximityHit[]> {
  const self = await prisma.declaration.findUnique({
    where: { id: declarationId },
    include: { locations: true }
  });
  if (!self) return [];

  const others = await prisma.farmLocation.findMany({
    where: { declarationId: { not: declarationId } },
    include: { declaration: { select: { id: true, name: true, civilId: true } } }
  });

  const hits: ProximityHit[] = [];
  self.locations.forEach((mine, idx) => {
    for (const other of others) {
      const d = distanceMeters(
        { lat: mine.latitude, lng: mine.longitude },
        { lat: other.latitude, lng: other.longitude }
      );
      if (d <= PROXIMITY_METERS) {
        hits.push({
          distance: d,
          thisLocationIndex: idx,
          otherName: other.declaration.name,
          otherCivilId: other.declaration.civilId,
          otherDeclarationId: other.declaration.id,
          otherLat: other.latitude,
          otherLng: other.longitude,
          thisLat: mine.latitude,
          thisLng: mine.longitude
        });
      }
    }
  });
  return hits;
}
