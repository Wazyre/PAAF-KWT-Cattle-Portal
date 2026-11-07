// Makes the sign-in links to put in Sahel notifications (the "actionUrl" of the button).
// Run via `npm run make:links -- <civil id>... ` or `npm run make:links -- --file ids.txt`.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { entryLinkSecret, signEntryLink } from "../src/lib/entry-link";

const USAGE = `
Usage: npm run make:links -- [--base https://selfdeclaration.paaf.gov.kw] <civil id>...
       npm run make:links -- [--base ...] --file ids.txt

  --base   the public address of the portal (default: the first ALLOWED_ORIGINS entry in .env)
  --file   a text/CSV file with one civil ID per line (the first column is used; a header row is skipped)

Prints "civilId,link" lines. Needs ENTRY_LINK_SECRET in .env (a long random text; keep it private).
`;

function fail(message: string): never {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let base = "";
const ids: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base") base = args[++i] ?? "";
  else if (args[i] === "--file") {
    const file = args[++i];
    if (!file) fail("--file needs a file name.");
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) ids.push(line.split(/[,;\t]/)[0].trim());
  } else ids.push(args[i]);
}

const secret = entryLinkSecret();
if (!secret) fail("ENTRY_LINK_SECRET is not set in .env.");
if (!base) base = (process.env.ALLOWED_ORIGINS ?? "").split(",")[0].trim();
if (!base) fail("Pass --base https://<portal address> (or set ALLOWED_ORIGINS in .env).");
if (!/^https?:\/\//.test(base)) base = `https://${base}`;
base = base.replace(/\/+$/, "");

let bad = 0;
for (const id of ids.filter(Boolean)) {
  if (!/^\d{12}$/.test(id)) {
    if (/^\d+$/.test(id) || ids.length === 1) {
      console.error(`Skipped "${id}": a civil ID has 12 digits.`);
      bad++;
    }
    continue; // a header row
  }
  console.log(`${id},${base}/?c=${id}&k=${signEntryLink(id, secret)}`);
}
if (ids.length === 0) fail("Give at least one civil ID.");
if (bad) process.exitCode = 1;
