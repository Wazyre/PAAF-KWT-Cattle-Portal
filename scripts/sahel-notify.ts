// Sends Sahel notifications that carry a signed portal sign-in link. Run via `npm run notify -- <options>`.
// Nothing is sent to the production Sahel service unless --prod AND --yes are both given.
import "dotenv/config";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { entryLinkSecret, entryLinkUrl } from "../src/lib/entry-link";
import { TEMPLATE_IDS, buildPayload, describeTemplate, missingParams, sendNotification, type SahelParams, type TemplateId } from "../src/lib/sahel";

const TEST_URL = process.env.SAHEL_URL_TEST || "http://192.168.1.71:8080/sahel/notifications/single";
const PROD_URL = process.env.SAHEL_URL_PROD || "http://192.168.1.71:8080/sahel/prod/notifications/single";
const SENT_LOG = "logs/sahel-sent.csv";

const USAGE = `
Usage: npm run notify -- --template <name> [who] [message values] [options]

Templates:
${TEMPLATE_IDS.map((id) => `  ${id.padEnd(14)} ${describeTemplate(id).describe}${describeTemplate(id).needs.length ? `  (needs ${describeTemplate(id).needs.map((n) => "--" + n.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())).join(" ")})` : ""}`).join("\n")}

Who gets it (pick one or more):
  <civil id> ...      civil IDs listed on the command line
  --file ids.txt      one civil ID per line (first column of a CSV; a header row is skipped)
  --unregistered      every citizen in the database who has not submitted a declaration
  --registered        every citizen who has submitted a declaration

Message values (fill the [placeholders] of the template):
  --deadline "15 Dec 2026"   --contact "..."   --date "..."   --start "..."   --end "..."   --update-period "..."

Options:
  --no-link           send with an EMPTY actionUrl (the button stays, it opens nothing); needs no secret or address
  --no-button         send without any button (empty actionButtonRequestList)
  --base <address>    the portal address used in the link (default: PORTAL_URL in .env), e.g. https://selfdeclaration.paaf.gov.kw
  --dry-run           show what would be sent (first message in full) and send nothing
  --prod --yes        send through the production Sahel service (without --yes it only previews)
  --limit <n>         send to the first n people only (a careful way to start)
  --resend            send again to people who already got this template (otherwise they are skipped)
  --delay <ms>        pause between messages (default 300)

Without --prod the TEST service is used, which only accepts the Sahel test civil ID.
Settings in .env: ENTRY_LINK_SECRET (required), PORTAL_URL, SAHEL_URL_TEST, SAHEL_URL_PROD, SAHEL_AUTH_HEADER ("Name: value", only if Sahel requires one).
Every send is recorded in ${SENT_LOG}.
`;

function fail(message: string): never {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(1);
}

// ------------------------------------------------------------------ arguments

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUE_OPTIONS = ["--template", "--file", "--base", "--limit", "--delay", "--deadline", "--contact", "--date", "--start", "--end", "--update-period"];

if (flag("--help") || flag("-h") || args.length === 0) {
  console.log(USAGE);
  process.exit(0);
}

const template = option("--template") as TemplateId | undefined;
if (!template || !TEMPLATE_IDS.includes(template)) fail(`--template must be one of: ${TEMPLATE_IDS.join(", ")}.`);

const params: SahelParams = {
  deadline: option("--deadline"),
  contact: option("--contact"),
  date: option("--date"),
  start: option("--start"),
  end: option("--end"),
  updatePeriod: option("--update-period")
};
const missing = missingParams(template, params);
if (missing.length) fail(`The "${template}" message needs ${missing.map((m) => "--" + m.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())).join(", ")}.`);

// Links are only needed when the message has a link button.
const linkMode = flag("--no-button") ? "none" : flag("--no-link") ? "empty" : "signed";
if (flag("--no-button") && flag("--no-link")) fail("Use --no-link or --no-button, not both.");
const secret = entryLinkSecret();
const base = option("--base") || process.env.PORTAL_URL?.trim();
if (linkMode === "signed") {
  if (!secret) fail("ENTRY_LINK_SECRET is not set in .env (it signs the sign-in links). Use --no-link to send without a link.");
  if (!base) fail("Pass --base https://<portal address> (or set PORTAL_URL in .env).");
}

// Narrowed copies for the functions below (TypeScript does not carry the checks above into them).
const chosen: TemplateId = template;
// The button's actionUrl for one person: a signed link, an empty string, or null for no button.
const linkFor = (civilId: string): string | null => (linkMode === "none" ? null : linkMode === "empty" ? "" : entryLinkUrl(base!, civilId, secret!));

const prod = flag("--prod");
const live = flag("--dry-run") ? false : prod ? flag("--yes") : true;
const limit = option("--limit") ? Number(option("--limit")) : Infinity;
const delay = Number(option("--delay") ?? 300);
if (!(limit >= 1) || !(delay >= 0)) fail("--limit must be 1 or more and --delay 0 or more.");

// Civil IDs typed on the command line are every argument that is not an option or an option's value.
const typed = args.filter((a, i) => !a.startsWith("--") && !VALUE_OPTIONS.includes(args[i - 1] ?? ""));

async function recipients(): Promise<string[]> {
  const ids = new Set<string>();
  const add = (raw: string) => {
    const id = raw.trim();
    if (/^\d{12}$/.test(id)) ids.add(id);
    else if (/^\d+$/.test(id)) fail(`"${id}" is not a civil ID (12 digits).`);
  };
  typed.forEach(add);
  const file = option("--file");
  if (file) readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => add(line.split(/[,;\t]/)[0]));
  if (flag("--unregistered") || flag("--registered")) {
    const { prisma } = await import("../src/lib/prisma");
    const declared = new Set((await prisma.declaration.findMany({ select: { civilId: true } })).map((d) => d.civilId));
    const citizens = await prisma.citizen.findMany({ select: { civilId: true }, orderBy: { civilId: "asc" } });
    for (const c of citizens) if ((flag("--registered") && declared.has(c.civilId)) || (flag("--unregistered") && !declared.has(c.civilId))) ids.add(c.civilId);
    await prisma.$disconnect();
  }
  return [...ids];
}

function alreadySent(mode: string): Set<string> {
  const done = new Set<string>();
  if (!existsSync(SENT_LOG)) return done;
  for (const line of readFileSync(SENT_LOG, "utf8").split(/\r?\n/)) {
    const [, logMode, logTemplate, civilId, status] = line.split(",");
    if (logMode === mode && logTemplate === chosen && status === "ok") done.add(civilId);
  }
  return done;
}

function record(mode: string, civilId: string, status: string, detail: string) {
  mkdirSync("logs", { recursive: true });
  appendFileSync(SENT_LOG, `${new Date().toISOString()},${mode},${chosen},${civilId},${status},${detail.replace(/[,\r\n]+/g, " ").slice(0, 120)}\n`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------- main
async function main() {

  const mode = prod ? "prod" : "test";
  const url = prod ? PROD_URL : TEST_URL;
  let everyone = await recipients();
  if (everyone.length === 0) fail("Nobody to send to: list civil IDs, or use --file, --unregistered or --registered.");

  if (!flag("--resend")) {
    const done = alreadySent(mode);
    const before = everyone.length;
    everyone = everyone.filter((id) => !done.has(id));
    if (before !== everyone.length) console.log(`Skipping ${before - everyone.length} people who already received "${chosen}" (use --resend to send again).`);
  }
  everyone = everyone.slice(0, limit);
  if (everyone.length === 0) {
    console.log("Nothing left to send.");
    process.exit(0);
  }

  const sample = buildPayload(chosen, everyone[0], linkFor(everyone[0]), params);
  console.log(`${live ? "Sending" : "Preview of"} "${chosen}" to ${everyone.length} ${everyone.length === 1 ? "person" : "people"} through the ${mode.toUpperCase()} Sahel service:\n  ${url}`);

  if (!live) {
    console.log(`\nFirst message (${everyone[0]}):\n${JSON.stringify(sample, null, 2)}`);
    console.log(prod && !flag("--dry-run") ? "\nNothing was sent. Add --yes to send this through the PRODUCTION service." : "\nNothing was sent (dry run).");
    process.exit(0);
  }

  let ok = 0;
  let failed = 0;
  let streak = 0;
  for (const civilId of everyone) {
    const payload = buildPayload(chosen, civilId, linkFor(civilId), params);
    const result = await sendNotification(url, payload, process.env.SAHEL_AUTH_HEADER);
    if (result.ok) {
      ok++;
      streak = 0;
      record(mode, civilId, "ok", `HTTP ${result.status} ${result.detail}`);
      console.log(`  sent    ${civilId}  HTTP ${result.status}  ${result.detail.slice(0, 80)}`);
    } else {
      failed++;
      streak++;
      record(mode, civilId, "failed", `HTTP ${result.status} ${result.detail}`);
      console.error(`  FAILED  ${civilId}  ${result.status ? `HTTP ${result.status} ` : ""}${result.detail.slice(0, 120)}`);
      if (streak >= 5) {
        console.error("\nStopping: 5 failures in a row. Fix the problem above and run again (people already sent to are skipped).");
        break;
      }
    }
    if (delay) await sleep(delay);
  }

  console.log(`\nDone: ${ok} sent, ${failed} failed. Log: ${SENT_LOG}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
