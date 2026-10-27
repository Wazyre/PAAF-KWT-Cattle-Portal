// CLI to import a farmer list (civil ID + name) into the Citizen table. Run via `npm run import:farmers -- <file.csv>`.
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { parseCsv } from "../src/lib/csv";

const USAGE = `
Usage: npm run import:farmers -- <file.csv> [--dry-run] [--skip-invalid]

The CSV needs a civil ID (12 digits) and a name per row. A header row is optional;
without one, the columns are taken as: civilId,name. Comma, semicolon and tab
separated files are all accepted. Arabic-Indic digits are converted.

  --dry-run       Validate and report, but write nothing
  --skip-invalid  Import the valid rows even if some rows are invalid
                  (by default any invalid row aborts the whole import)

Farmers already in the database are left unchanged. Imported farmers have no
declaration yet, so they appear in the "not-declared" export until they declare.
`;

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

  // Optional header: any first row whose first cell is not a civil ID.
  let idCol = 0;
  let nameCol = 1;
  let firstDataLine = 1;
  if (!/^\d{12}$/.test(clean(rows[0][0] ?? ""))) {
    const header = rows[0].map((c) => clean(c).toLowerCase());
    const id = header.findIndex((c) => /civil|مدني|^id$/.test(c));
    const name = header.findIndex((c) => /name|اسم/.test(c));
    if (id >= 0) idCol = id;
    if (name >= 0) nameCol = name;
    rows.shift();
    firstDataLine = 2;
  }

  const valid = new Map<string, string>();
  const invalid: string[] = [];
  let duplicates = 0;

  rows.forEach((r, i) => {
    const line = i + firstDataLine;
    const civilId = clean(r[idCol] ?? "");
    const name = clean(r[nameCol] ?? "").replace(/\s+/g, " ");
    if (!/^\d{12}$/.test(civilId)) {
      invalid.push(`line ${line}: civil ID must be 12 digits ("${civilId}")`);
    } else if (!name) {
      invalid.push(`line ${line}: missing name for ${civilId}`);
    } else if (valid.has(civilId)) {
      duplicates++;
    } else {
      valid.set(civilId, name);
    }
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

  const existing = new Set(
    (
      await prisma.citizen.findMany({
        where: { civilId: { in: [...valid.keys()] } },
        select: { civilId: true }
      })
    ).map((c) => c.civilId)
  );
  const fresh = [...valid].filter(([id]) => !existing.has(id));

  if (!dryRun) {
    for (let i = 0; i < fresh.length; i += 1000) {
      await prisma.citizen.createMany({
        data: fresh.slice(i, i + 1000).map(([civilId, name]) => ({ civilId, name })),
        skipDuplicates: true
      });
    }
  }

  console.log(dryRun ? "Dry run — nothing written." : "Import complete.");
  console.log(`  ${dryRun ? "would add" : "added"}:          ${fresh.length}`);
  console.log(`  already existed (unchanged): ${existing.size}`);
  if (duplicates) console.log(`  duplicate rows in file:      ${duplicates}`);
  if (invalid.length) console.log(`  invalid rows skipped:        ${invalid.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
