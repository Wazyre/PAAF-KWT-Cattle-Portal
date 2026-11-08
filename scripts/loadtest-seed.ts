// Fills a TEST database with fake farmers for the Locust load test (loadtest/). Run via `npm run loadtest:seed -- <options>`.
// Fake civil IDs are 900000000000, 900000000010, ... (they start with 9, so they can never be a real civil ID, and end in 0
// so the mock PACI approves them).
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const USAGE = `
Usage: npm run loadtest:seed -- [--count 4000] [--declared 60] [--force]
       npm run loadtest:seed -- --remove [--force]

  --count     how many fake farmers to create (default 4000)
  --declared  percent of them that also get a submitted declaration (default 60)
  --remove    delete every fake farmer (and their declarations) again
  --force     skip the safety check below

Safety: this refuses to run unless the database name in DATABASE_URL contains "test" or "load",
so it cannot fill the real database with fake people. Make a separate database, e.g. sheep_portal_loadtest.
`;

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const idFor = (i: number) => String(900000000000 + i * 10);

async function main() {
  if (args.includes("--help")) return console.log(USAGE);
  const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/").pathname.slice(1);
  if (!args.includes("--force") && !/test|load/i.test(dbName)) {
    console.error(`Refusing to run: the database "${dbName}" does not look like a test database (its name must contain "test" or "load").\n${USAGE}`);
    process.exit(1);
  }

  if (args.includes("--remove")) {
    const d = await prisma.declaration.deleteMany({ where: { civilId: { startsWith: "9000" } } });
    const c = await prisma.citizen.deleteMany({ where: { civilId: { startsWith: "9000" } } });
    const a = await prisma.loginAttempt.deleteMany({ where: { civilId: { startsWith: "9000" } } });
    console.log(`Removed ${c.count} fake farmers, ${d.count} declarations, ${a.count} sign-in attempts.`);
    return;
  }

  const count = option("--count", 4000);
  const declaredPct = option("--declared", 60);
  if (!(count >= 1) || !(declaredPct >= 0 && declaredPct <= 100)) {
    console.error(USAGE);
    process.exit(1);
  }

  const ids = Array.from({ length: count }, (_, i) => idFor(i));
  await prisma.citizen.createMany({ data: ids.map((civilId, i) => ({ civilId, name: `Load Test ${i}` })), skipDuplicates: true });

  const points = ["WAFRA", "JAHRA", "KABD", "ABDALI", "MINA_ABDULLAH"] as const;
  const declared = ids.slice(0, Math.round((count * declaredPct) / 100));
  const existing = new Set((await prisma.declaration.findMany({ where: { civilId: { in: declared } }, select: { civilId: true } })).map((d) => d.civilId));
  const todo = declared.filter((id) => !existing.has(id));
  for (let start = 0; start < todo.length; start += 50) {
    await Promise.all(
      todo.slice(start, start + 50).map((civilId, k) =>
        prisma.declaration.create({
          data: {
            civilId,
            name: `Load Test ${start + k}`,
            mobile: "50000000",
            animalGroups: {
              create: {
                animalType: "SHEEP_GOATS",
                locations: {
                  create: {
                    gatheringPoint: points[(start + k) % points.length],
                    latitude: 29.1 + ((start + k) % 100) / 1000,
                    longitude: 47.6 + ((start + k) % 100) / 1000,
                    locationLink: "https://maps.google.com/?q=29.1,47.6",
                    chippedCount: 100 + ((start + k) % 400),
                    males: 20,
                    females: 80,
                    numTenders: 1
                  }
                }
              }
            }
          }
        })
      )
    );
  }
  console.log(`Fake farmers: ${count} (${declared.length} with a declaration, ${todo.length} newly created). Civil IDs ${ids[0]} … ${ids[ids.length - 1]}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
