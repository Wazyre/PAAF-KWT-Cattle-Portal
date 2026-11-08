// CLI to take people off the lists: farmers, investigators, head investigators, superusers. Run via `npm run remove:people -- <options>`.
// Removing someone stops them signing in, and takes effect immediately even for a session that is already open.
// Nothing is deleted unless --yes is given; without it you only get a preview.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const USAGE = `
Usage: npm run remove:people -- --role <role> <civil id>... [--file ids.txt] [--with-declaration] [--yes]

  --role              farmer | investigator | head | superuser | all   (required; "all" removes the person from every list)
  <civil id>...       civil IDs on the command line
  --file ids.txt      one civil ID per line (first column of a CSV; a header row is skipped)
  --with-declaration  farmers only: ALSO delete their declaration, its audit and its revisions (otherwise the data is kept)
  --yes               really delete; without it nothing is changed and you see what would happen

Removing an investigator also deletes the group assignments they hold (the head investigator can assign those groups again).
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

// The generated database client is not in git: after an update it must be regenerated (the Windows service does this on every start).
function superuserModelAvailable(): boolean {
  if ((prisma as unknown as Record<string, unknown>).superuser !== undefined) return true;
  console.error("The database client is out of date (it does not know the Superuser table yet).\nStop the portal (schtasks /End /TN \"Sheep Portal\"), then run: npm run db:generate  and  npm run db:push\nor simply restart the service, which does both.");
  process.exitCode = 1;
  return false;
}

const ROLES = ["farmer", "investigator", "head", "superuser", "all"];

async function main() {
  if (!superuserModelAvailable()) return;
  if (args.includes("--help") || args.length === 0) return console.log(USAGE);

  const role = option("--role");
  if (!role || !ROLES.includes(role)) fail(`--role must be one of: ${ROLES.join(", ")}.`);
  const yes = args.includes("--yes");
  const withDeclaration = args.includes("--with-declaration");
  if (withDeclaration && role !== "farmer" && role !== "all") fail("--with-declaration only applies to farmers.");

  const ids = new Set<string>();
  const add = (raw: string) => {
    const id = clean(raw);
    if (/^\d{12}$/.test(id)) ids.add(id);
    else if (/^\d+$/.test(id)) fail(`"${id}" is not a civil ID (12 digits).`);
  };
  args.filter((a, i) => !a.startsWith("--") && !["--role", "--file"].includes(args[i - 1] ?? "")).forEach(add);
  const file = option("--file");
  if (file) readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => add(line.split(/[,;\t]/)[0]));
  if (ids.size === 0) fail("Give at least one civil ID.");
  const list = [...ids];

  const wants = (r: string) => role === r || role === "all";
  const found = {
    farmer: wants("farmer") ? await prisma.citizen.findMany({ where: { civilId: { in: list } } }) : [],
    investigator: wants("investigator") ? await prisma.supervisor.findMany({ where: { civilId: { in: list } }, include: { _count: { select: { assignments: true } } } }) : [],
    head: wants("head") ? await prisma.headSupervisor.findMany({ where: { civilId: { in: list } } }) : [],
    superuser: wants("superuser") ? await prisma.superuser.findMany({ where: { civilId: { in: list } } }) : []
  };
  const declarations = withDeclaration
    ? await prisma.declaration.findMany({ where: { civilId: { in: list } }, select: { civilId: true } })
    : [];

  console.log(`${yes ? "Removing" : "Would remove"} (${list.length} civil ID${list.length === 1 ? "" : "s"} given):`);
  for (const f of found.farmer) console.log(`  farmer        ${f.civilId}  ${f.name}`);
  for (const s of found.investigator) console.log(`  investigator  ${s.civilId}  ${s.name}  (${s._count.assignments} group assignment${s._count.assignments === 1 ? "" : "s"} deleted too)`);
  for (const h of found.head) console.log(`  head          ${h.civilId}  ${h.name}`);
  for (const u of found.superuser) console.log(`  superuser     ${u.civilId}  ${u.name}`);
  for (const d of declarations) console.log(`  declaration   ${d.civilId}  (with its audit and revisions)`);
  const total = found.farmer.length + found.investigator.length + found.head.length + found.superuser.length + declarations.length;

  const matched = new Set([...found.farmer, ...found.investigator, ...found.head, ...found.superuser].map((p) => p.civilId));
  const missing = list.filter((id) => !matched.has(id));
  if (missing.length) console.log(`Not on the ${role === "all" ? "" : role + " "}list${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
  if (total === 0) return console.log("Nothing to remove.");

  if (!yes) return console.log("\nNothing was deleted. Add --yes to delete.");

  if (declarations.length) await prisma.declaration.deleteMany({ where: { civilId: { in: declarations.map((d) => d.civilId) } } });
  if (found.farmer.length) await prisma.citizen.deleteMany({ where: { civilId: { in: found.farmer.map((p) => p.civilId) } } });
  if (found.investigator.length) await prisma.supervisor.deleteMany({ where: { civilId: { in: found.investigator.map((p) => p.civilId) } } });
  if (found.head.length) await prisma.headSupervisor.deleteMany({ where: { civilId: { in: found.head.map((p) => p.civilId) } } });
  if (found.superuser.length) await prisma.superuser.deleteMany({ where: { civilId: { in: found.superuser.map((p) => p.civilId) } } });
  console.log(`\nDone: ${total} removed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
