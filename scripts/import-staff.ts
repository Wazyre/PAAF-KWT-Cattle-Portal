// CLI to import investigators and head investigators. Run via `npm run import:staff -- <file.csv>`.
// People listed here can sign in and are sent to the matching portal; farmers come from `npm run import:farmers`.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { parseCsv } from "../src/lib/csv";

const USAGE = `
Usage: npm run import:staff -- <file.csv> [--dry-run] [--skip-invalid]

One row per person: civilId,name,role
  role is "investigator" (field investigator) or "head" (head investigator).
  A header row is optional. Comma, semicolon and tab separated files are accepted.
  Arabic-Indic digits are converted. "مفتش" and "رئيس" also work as roles.

  --dry-run       Validate and report, but write nothing
  --skip-invalid  Import the valid rows even if some rows are invalid
                  (by default any invalid row aborts the whole import)

Someone already in the database keeps their record; a changed name is updated.
The same person can appear as both investigator and head: list them twice.
`;

type StaffRole = "investigator" | "head";

function fail(message: string): never {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(1);
}

// Convert Arabic-Indic / Persian digits to ASCII and drop invisible bidi marks.
function clean(v: string): string {
  return v
    .replace(/[‎‏‪-‮]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
}

function parseRole(v: string): StaffRole | null {
  const r = v.toLowerCase();
  if (/^(head|رئيس)/.test(r)) return "head";
  if (/^(investigator|supervisor|inspector|مفتش)/.test(r)) return "investigator";
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipInvalid = args.includes("--skip-invalid");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) fail("provide the path of a CSV file.");

  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    fail(`cannot read "${file}": ${(e as Error).message}`);
  }

  const rows = parseCsv(text);
  if (rows.length === 0) fail("the file has no rows.");

  let idCol = 0;
  let nameCol = 1;
  let roleCol = 2;
  let firstDataLine = 1;
  if (!/^\d{12}$/.test(clean(rows[0][0] ?? ""))) {
    const header = rows[0].map((c) => clean(c).toLowerCase());
    const id = header.findIndex((c) => /civil|مدني|^id$/.test(c));
    const name = header.findIndex((c) => /name|اسم/.test(c));
    const role = header.findIndex((c) => /role|صفة|دور/.test(c));
    if (id >= 0) idCol = id;
    if (name >= 0) nameCol = name;
    if (role >= 0) roleCol = role;
    rows.shift();
    firstDataLine = 2;
  }

  const valid = new Map<string, { civilId: string; name: string; role: StaffRole }>();
  const invalid: string[] = [];
  let duplicates = 0;

  rows.forEach((r, i) => {
    const line = i + firstDataLine;
    const civilId = clean(r[idCol] ?? "");
    const name = clean(r[nameCol] ?? "").replace(/\s+/g, " ");
    const role = parseRole(clean(r[roleCol] ?? ""));
    if (!/^\d{12}$/.test(civilId)) invalid.push(`line ${line}: civil ID must be 12 digits ("${civilId}")`);
    else if (!name) invalid.push(`line ${line}: missing name for ${civilId}`);
    else if (!role) invalid.push(`line ${line}: role must be "investigator" or "head" ("${clean(r[roleCol] ?? "")}")`);
    else if (valid.has(`${role}:${civilId}`)) duplicates++;
    else valid.set(`${role}:${civilId}`, { civilId, name, role });
  });

  if (invalid.length > 0) {
    console.error(`${invalid.length} invalid row(s):`);
    invalid.slice(0, 20).forEach((m) => console.error(`  ${m}`));
    if (invalid.length > 20) console.error(`  … and ${invalid.length - 20} more`);
    if (!skipInvalid) {
      console.error("\nNothing was imported. Fix the file, or pass --skip-invalid.");
      process.exitCode = 1;
      return;
    }
  }

  const people = [...valid.values()];
  const counts = { investigator: 0, head: 0 };
  for (const p of people) {
    counts[p.role]++;
    if (dryRun) continue;
    if (p.role === "head") {
      await prisma.headSupervisor.upsert({ where: { civilId: p.civilId }, update: { name: p.name }, create: { civilId: p.civilId, name: p.name } });
    } else {
      await prisma.supervisor.upsert({ where: { civilId: p.civilId }, update: { name: p.name }, create: { civilId: p.civilId, name: p.name } });
    }
  }

  console.log(dryRun ? "Dry run — nothing written." : "Import complete.");
  console.log(`  investigators: ${counts.investigator}`);
  console.log(`  head investigators: ${counts.head}`);
  if (duplicates) console.log(`  duplicate rows in file: ${duplicates}`);
  if (invalid.length) console.log(`  invalid rows skipped:   ${invalid.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
