// Which declarations an investigator may work on: only the ones in the groups the head investigator assigned to them.
// Mirrors how the investigator's schedule is built (src/app/supervisor/page.tsx):
//   SOLO assignment  -> that one declaration
//   SMALL assignment -> every declaration with locations of the assignment's animal type at its gathering point,
//                       unless the farmer's chipped heads there exceed HEAD_THRESHOLD (those get a SOLO group of their own)
import { prisma } from "./prisma";
import { HEAD_THRESHOLD } from "./constants";
import type { Session } from "./session";

/** Head investigators may open any declaration; an investigator only those in their assigned groups. */
export async function mayAudit(session: Session, declarationId: number): Promise<boolean> {
  if (!Number.isInteger(declarationId)) return false;
  if (session.roles.includes("HEAD")) return true;

  const supervisor = await prisma.supervisor.findUnique({
    where: { civilId: session.civilId },
    select: { id: true }
  });
  if (!supervisor) return false;

  const assignments = await prisma.assignment.findMany({ where: { supervisorId: supervisor.id } });
  if (assignments.length === 0) return false;
  if (assignments.some((a) => a.groupType === "SOLO" && a.soloDeclarationId === declarationId)) return true;

  const smallGroups = assignments.filter((a) => a.groupType === "SMALL");
  if (smallGroups.length === 0) return false;

  const declaration = await prisma.declaration.findUnique({
    where: { id: declarationId },
    select: { animalGroups: { select: { animalType: true, locations: { select: { gatheringPoint: true, chippedCount: true } } } } }
  });
  if (!declaration) return false;

  return smallGroups.some((a) => {
    const locations = declaration.animalGroups
      .filter((g) => g.animalType === a.animalType)
      .flatMap((g) => g.locations)
      .filter((l) => l.gatheringPoint === a.gatheringPoint);
    if (locations.length === 0) return false;
    return locations.reduce((sum, l) => sum + l.chippedCount, 0) <= HEAD_THRESHOLD;
  });
}
