// CLI to manage the systems that may call the declaration API (/api/v1) and their keys. There is deliberately no screen
// for this; run it on the server. Run via `npm run api:clients -- <command>`.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generateApiKey, hashApiKey } from "../src/lib/api/auth";

const USAGE = `
Usage: npm run api:clients -- create <name>     make a client and print its API key (shown once)
       npm run api:clients -- rotate <name>     replace the key (the old one stops working at once); also re-enables a revoked client
       npm run api:clients -- revoke <name>     stop the key working, effective on its next request
       npm run api:clients -- list

<name> is a short label for the calling system, e.g. "farmer-form". It is written to the server log on every
write and kept with each recorded legal acceptance. Only a hash of the key is stored, so a lost key cannot be
shown again: rotate it.
`;

function fail(message: string): never {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(1);
}

// The generated database client is not in git: after an update it must be regenerated (the Windows service does this on every start).
function apiClientModelAvailable(): boolean {
  if ((prisma as unknown as Record<string, unknown>).apiClient !== undefined) return true;
  console.error("The database client is out of date (it does not know the ApiClient table yet).\nStop the portal (schtasks /End /TN \"Sheep Portal\"), then run: npm run db:generate  and  npm run db:push\nor simply restart the service, which does both.");
  process.exitCode = 1;
  return false;
}

function show(name: string, key: string) {
  console.log(`\nAPI key for "${name}" (copy it now, it cannot be shown again):\n\n  ${key}\n`);
  console.log("The calling system sends it as:  Authorization: Bearer <key>");
  console.log("Keep it on that system's server only: never in a web page or mobile app.");
}

async function main() {
  if (!apiClientModelAvailable()) return;
  const [command, rawName] = process.argv.slice(2);

  if (command === "list") {
    const all = await prisma.apiClient.findMany({ orderBy: { name: "asc" } });
    if (all.length === 0) console.log("No API clients.");
    for (const c of all) {
      const state = c.revokedAt ? "REVOKED" : "active ";
      const used = c.lastUsedAt ? `last used ${c.lastUsedAt.toISOString()}` : "never used";
      console.log(`${state}  ${c.name}  (created ${c.createdAt.toISOString().slice(0, 10)}, ${used})`);
    }
    return;
  }

  const name = (rawName ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/.test(name)) fail("Give a name of letters, digits, spaces, dots, dashes or underscores (up to 60 characters).");

  if (command === "create") {
    if (await prisma.apiClient.findUnique({ where: { name } })) fail(`"${name}" already exists. Use rotate to replace its key.`);
    const key = generateApiKey();
    await prisma.apiClient.create({ data: { name, keyHash: hashApiKey(key) } });
    show(name, key);
  } else if (command === "rotate") {
    if (!(await prisma.apiClient.findUnique({ where: { name } }))) fail(`There is no client "${name}".`);
    const key = generateApiKey();
    await prisma.apiClient.update({ where: { name }, data: { keyHash: hashApiKey(key), revokedAt: null } });
    show(name, key);
  } else if (command === "revoke") {
    const done = await prisma.apiClient.updateMany({ where: { name, revokedAt: null }, data: { revokedAt: new Date() } });
    console.log(done.count ? `"${name}" can no longer call the API.` : `"${name}" does not exist or was already revoked.`);
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
