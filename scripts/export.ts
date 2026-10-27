// CLI to export data as CSV files. Run via `npm run export -- <macro|all|list> [--dir <folder>]`.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import {
  EXPORT_MACROS,
  buildCsv,
  exportFilename,
  findMacro
} from "../src/lib/exports";

const USAGE = `
Usage: npm run export -- <macro|all|list> [--dir <folder>]

  list      Show the available exports
  all       Write every export
  <macro>   Write one export (names below)

  --dir     Output folder (default: ./exports)

${EXPORT_MACROS.map((m) => `  ${m.key.padEnd(15)} ${m.label}`).join("\n")}
`;

function fail(message: string): never {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx >= 0 ? args[dirIdx + 1] : "exports";
  if (dirIdx >= 0 && (!dir || dir.startsWith("--"))) fail("--dir needs a folder.");
  const target = args.find((a, i) => !a.startsWith("--") && i !== dirIdx + 1);

  if (!target || target === "list") {
    console.log(USAGE);
    return;
  }

  const macros = target === "all" ? EXPORT_MACROS : [findMacro(target)];
  if (macros.some((m) => !m)) fail(`unknown export "${target}".`);

  mkdirSync(dir, { recursive: true });
  for (const m of macros) {
    const csv = await buildCsv(m!);
    const path = join(dir, exportFilename(m!.key));
    writeFileSync(path, csv, "utf8");
    const dataRows = csv.split("\r\n").length - 2; // minus header and trailing newline
    console.log(`${path}  (${Math.max(dataRows, 0)} rows)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
