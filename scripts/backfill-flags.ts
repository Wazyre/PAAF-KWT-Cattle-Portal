// Recomputes Declaration.lowHeadCount for every declaration. Run via `npm run db:backfill-flags` after changing LOW_HEAD_THRESHOLD or deploying the flag.
import { prisma } from "../src/lib/prisma";
import { isLowHeadCount, totalHeads } from "../src/lib/heads";

async function main() {
  const decls = await prisma.declaration.findMany({
    select: {
      id: true,
      lowHeadCount: true,
      animalGroups: { select: { locations: { select: { chippedCount: true } } } }
    }
  });

  const toTrue: number[] = [];
  const toFalse: number[] = [];
  for (const d of decls) {
    const low = isLowHeadCount(totalHeads(d.animalGroups));
    if (low && !d.lowHeadCount) toTrue.push(d.id);
    if (!low && d.lowHeadCount) toFalse.push(d.id);
  }

  if (toTrue.length)
    await prisma.declaration.updateMany({
      where: { id: { in: toTrue } },
      data: { lowHeadCount: true }
    });
  if (toFalse.length)
    await prisma.declaration.updateMany({
      where: { id: { in: toFalse } },
      data: { lowHeadCount: false }
    });

  console.log(
    `Checked ${decls.length} declarations: ${toTrue.length} flagged, ${toFalse.length} unflagged.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
