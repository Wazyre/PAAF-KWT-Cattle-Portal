// CLI to toggle farmer-portal features. Run via `npm run access -- <args>` (see USAGE below).
import type { AccessMode, Feature } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  getFeatureState,
  setFeatureState,
  type FeatureAccessState
} from "../src/lib/access";

const FEATURES: Record<string, Feature> = {
  registration: "REGISTRATION",
  updates: "UPDATES"
};

const USAGE = `
Usage: npm run access -- <command>

  status                              Show the current state of both features

  <feature> on                        Open the feature to everyone
  <feature> off                       Close the feature for everyone
  <feature> only <civilId...>         Open it ONLY to these civil IDs (replaces the list)
  <feature> add <civilId...>          Add civil IDs to the allow-list (switches to "only" mode)
  <feature> remove <civilId...>       Remove civil IDs from the allow-list

<feature> is one of:
  registration   first-time declarations
  updates        edits to an existing declaration

Examples:
  npm run access -- registration off
  npm run access -- updates only 287010112345 290050598765
  npm run access -- registration on
`;

function fail(message: string): never {
  console.error(`Error: ${message}\n${USAGE}`);
  process.exit(1);
}

function parseCivilIds(args: string[]): string[] {
  if (args.length === 0) fail("provide at least one civil ID.");
  const bad = args.filter((id) => !/^\d{12}$/.test(id));
  if (bad.length) fail(`civil IDs must be exactly 12 digits: ${bad.join(", ")}`);
  return Array.from(new Set(args));
}

function describe(state: FeatureAccessState): string {
  const labels: Record<AccessMode, string> = {
    ALL: "ON  (everyone)",
    OFF: "OFF (nobody)",
    SPECIFIC: `ONLY (${state.civilIds.length} civil ID${state.civilIds.length === 1 ? "" : "s"})`
  };
  const ids =
    state.mode === "SPECIFIC" && state.civilIds.length
      ? `\n      ${state.civilIds.join("\n      ")}`
      : "";
  return labels[state.mode] + ids;
}

async function printStatus() {
  for (const [name, feature] of Object.entries(FEATURES)) {
    console.log(`${name.padEnd(13)} ${describe(await getFeatureState(feature))}`);
  }
}

async function main() {
  const [first, second, ...rest] = process.argv.slice(2);

  if (!first || first === "status") {
    await printStatus();
    return;
  }

  const feature = FEATURES[first];
  if (!feature) fail(`unknown command or feature "${first}".`);

  const current = await getFeatureState(feature);
  let next: FeatureAccessState;

  switch (second) {
    case "on":
      next = { mode: "ALL", civilIds: [] };
      break;
    case "off":
      next = { mode: "OFF", civilIds: [] };
      break;
    case "only":
      next = { mode: "SPECIFIC", civilIds: parseCivilIds(rest) };
      break;
    case "add":
      next = {
        mode: "SPECIFIC",
        civilIds: Array.from(new Set([...current.civilIds, ...parseCivilIds(rest)]))
      };
      break;
    case "remove": {
      const remove = new Set(parseCivilIds(rest));
      next = {
        mode: "SPECIFIC",
        civilIds: current.civilIds.filter((id) => !remove.has(id))
      };
      break;
    }
    default:
      fail(`unknown action "${second ?? ""}".`);
  }

  await setFeatureState(feature, next);
  console.log(`${first} -> ${describe(next)}`);
  if (next.mode === "SPECIFIC" && next.civilIds.length === 0) {
    console.log("Note: the allow-list is empty, so nobody currently has access.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
