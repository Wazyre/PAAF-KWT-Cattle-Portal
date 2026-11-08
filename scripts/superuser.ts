// CLI to manage superusers: people who can open all three portals (farmer, investigator, head investigator) after signing in
// through PACI. There is deliberately no screen for this; run it on the server. Run via `npm run superuser -- <command>`.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const USAGE = `
Usage: npm run superuser -- add <civil id> "<name>"
       npm run superuser -- remove <civil id>
       npm run superuser -- list

A superuser signs in like everyone else (the PACI request goes to their phone) and then sees all three portals.
They can open every declaration and audit and use the head investigator tools and exports. Removing one takes effect
immediately, even for a session that is already signed in.
`;

function fail(message: string): never {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(1);
}

// Arabic-Indic and Persian digits become ASCII, invisible bidi marks are dropped.
const clean = (v: string) =>
  v
    .replace(/[‎‏‪-‮]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();

async function main() {
  const [command, rawId, ...nameParts] = process.argv.slice(2);

  if (command === "list") {
    const all = await prisma.superuser.findMany({ orderBy: { name: "asc" } });
    if (all.length === 0) console.log("No superusers.");
    for (const u of all) console.log(`${u.civilId}  ${u.name}`);
    return;
  }

  const civilId = clean(rawId ?? "");
  if (!/^\d{12}$/.test(civilId)) fail("Give a 12-digit civil ID.");

  if (command === "add") {
    const name = clean(nameParts.join(" "));
    if (!name) fail("Give the person's name.");
    await prisma.superuser.upsert({ where: { civilId }, create: { civilId, name }, update: { name } });
    console.log(`${name} (${civilId}) is now a superuser.`);
  } else if (command === "remove") {
    const done = await prisma.superuser.deleteMany({ where: { civilId } });
    console.log(done.count ? `${civilId} is no longer a superuser.` : `${civilId} was not a superuser.`);
  } else {
    fail("Unknown command.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
