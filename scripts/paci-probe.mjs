// Experiment: does PAAF's e-services "paciCall" reply change when a PACI request is approved?
//
//   node scripts/paci-probe.mjs <your civil id> [--seconds 120] [--interval 5]
//
// Sends ONE real PACI request to the given civil ID (approve or ignore it on your phone), then every few seconds posts
// { CivilID: <request id>, flag: "True" } to paciCall and prints what it answers. Run it twice: once approving, once not.
// If the answer is the same either way, paciCall only acknowledges the call and cannot be used to confirm a sign-in.
// Settings (same as the portal): PACI_AUTH_URL, PACI_AUTH_HEADER ("Name: value"); PACI_RESULT_URL overrides the paciCall address.
import "dotenv/config";

const args = process.argv.slice(2);
const civilId = args.find((a) => /^\d{12}$/.test(a));
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const seconds = option("seconds", 120);
const interval = option("interval", 5);
if (!civilId) {
  console.error("Usage: node scripts/paci-probe.mjs <12-digit civil ID> [--seconds 120] [--interval 5]");
  process.exit(1);
}

const AUTH_URL = process.env.PACI_AUTH_URL || "https://kmidinteg.paaf.gov.kw/api/PACI/Auth";
const RESULT_URL = process.env.PACI_RESULT_URL || "https://eservices.paaf.gov.kw/paafPortal/resourc/paciCall";
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const headers = { "Content-Type": "application/json" };
const extra = process.env.PACI_AUTH_HEADER;
if (extra && extra.includes(":")) headers[extra.slice(0, extra.indexOf(":")).trim()] = extra.slice(extra.indexOf(":") + 1).trim();

const stamp = (t0) => `t=${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s`;
const short = (id) => `${id.slice(0, 8)}…`;

async function post(url, body, extraHeaders = {}) {
  try {
    const res = await fetch(url, { method: "POST", headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    return `${res.status} ${(await res.text()).replace(/\s+/g, " ").slice(0, 200)}`;
  } catch (e) {
    return `FAILED ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`;
  }
}

console.log(`Asking PACI to send a request to ${civilId.slice(0, 3)}*******${civilId.slice(-2)} …`);
const authReply = await post(AUTH_URL, {
  CivilID: civilId,
  ServiceDescAr: "اختبار التحقق من الهوية",
  ServiceDescEn: "Identity check test",
  AuthReassonAR: "اختبار",
  AuthReassonEn: "Test"
});
const requestId = authReply.match(GUID)?.[0];
console.log(`PACI Auth answered: ${authReply.replace(GUID, (m) => short(m))}`);
if (!requestId) {
  console.error("No request id in PACI's reply, so there is nothing to check. Stopping.");
  process.exit(1);
}

// Control: an id PACI never issued. If the real id is answered differently from this one, the endpoint distinguishes them.
const control = crypto.randomUUID();
console.log(`\nControl (random id ${short(control)}, never sent to PACI): ${await post(RESULT_URL, { CivilID: control, flag: "True" })}`);
console.log(`\nNow checking request ${short(requestId)} every ${interval}s for ${seconds}s. Approve (or ignore) it in the Hawyti app.\n`);

const t0 = Date.now();
let last = "";
while (Date.now() - t0 < seconds * 1000) {
  const reply = await post(RESULT_URL, { CivilID: requestId, flag: "True" });
  // Print on change, and a dot otherwise, so the moment the answer changes stands out.
  if (reply !== last) {
    console.log(`${stamp(t0)}  ${reply}${last ? "   <-- CHANGED" : ""}`);
    last = reply;
  } else {
    process.stdout.write(".");
  }
  await new Promise((r) => setTimeout(r, interval * 1000));
}
console.log(`\n\nDone. If the answer never changed (and matches the control), paciCall cannot confirm an approval.`);
