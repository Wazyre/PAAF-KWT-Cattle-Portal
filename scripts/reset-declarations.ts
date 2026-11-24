// CLI to reset farmers' declarations as if they had never entered any data. Run via `npm run reset:declaration -- <options>`.
// The farmer stays on the list and can sign in and declare again from scratch. Only the declaration is deleted,
// together with everything hanging off it: animal groups and locations, the investigator's audit (results, chip readings,
// approval), the revision history, and any solo group assignment for that declaration.
// Kept on purpose: the farmer's entry on the list, and their LegalAcceptance records (proof of what they accepted).
// Nothing is deleted unless --yes is given; without it you only get a preview.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const USAGE = `
Usage: npm run reset:declaration -- <civil id>... [--file ids.txt] [--yes]

  <civil id>...   civil IDs on the command line
  --file ids.txt  one civil ID per line (first column of a CSV; a header row is skipped)
  --yes           really delete; without it nothing is changed and you see what would happen

The farmer stays on the farmer list and can declare again. Their legal-acceptance records are kept.
To take a farmer off the list as well, use: npm run remove:people -- --role farmer <civil id> --with-declaration
`;

function fail(message: string): never {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const clean = (v: string) =>
  v
    .replace(/[‎‏‪-‮]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();

async function main() {
  if (args.includes("--help") || args.length === 0) return console.log(USAGE);

  const yes = args.includes("--yes");
  const ids = new Set<string>();
  const add = (raw: string) => {
    const id = clean(raw);
    if (/^\d{12}$/.test(id)) ids.add(id);
    else if (/^\d+$/.test(id)) fail(`"${id}" is not a civil ID (12 digits).`);
  };
  args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--file").forEach(add);
  const file = option("--file");
  if (file) readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => add(line.split(/[,;\t]/)[0]));
  if (ids.size === 0) fail("Give at least one civil ID.");
  const list = [...ids];

  const declarations = await prisma.declaration.findMany({
    where: { civilId: { in: list } },
    select: {
      id: true,
      civilId: true,
      name: true,
      audit: { select: { id: true, approvedAt: true } },
      _count: { select: { animalGroups: true, revisions: true, soloAssignments: true } }
    },
    orderBy: { civilId: "asc" }
  });

  console.log(`${yes ? "Resetting" : "Would reset"} (${list.length} civil ID${list.length === 1 ? "" : "s"} given):`);
  for (const d of declarations) {
    const parts = [
      `${d._count.animalGroups} animal group${d._count.animalGroups === 1 ? "" : "s"}`,
      d.audit ? (d.audit.approvedAt ? "an approved audit" : "an audit") : "no audit",
      `${d._count.revisions} revision${d._count.revisions === 1 ? "" : "s"}`
    ];
    if (d._count.soloAssignments) parts.push("a solo group assignment");
    console.log(`  ${d.civilId}  ${d.name}  (${parts.join(", ")})`);
  }

  const have = new Set(declarations.map((d) => d.civilId));
  const missing = list.filter((id) => !have.has(id));
  if (missing.length) {
    const registered = new Set((await prisma.citizen.findMany({ where: { civilId: { in: missing } }, select: { civilId: true } })).map((c) => c.civilId));
    const noDeclaration = missing.filter((id) => registered.has(id));
    const unknown = missing.filter((id) => !registered.has(id));
    if (noDeclaration.length) console.log(`No declaration to reset: ${noDeclaration.join(", ")}`);
    if (unknown.length) console.log(`Not on the farmer list and no declaration: ${unknown.join(", ")}`);
  }
  if (declarations.length === 0) return console.log("Nothing to reset.");

  if (!yes) return console.log("\nNothing was deleted. Add --yes to reset.");

  // Groups, locations, the audit and its readings, revisions and solo assignments all go with the declaration (cascading deletes).
  const result = await prisma.declaration.deleteMany({ where: { id: { in: declarations.map((d) => d.id) } } });
  console.log(`\nDone: ${result.count} declaration${result.count === 1 ? "" : "s"} reset. The farmers remain on the list.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
