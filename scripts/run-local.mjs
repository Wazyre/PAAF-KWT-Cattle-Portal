// Runs the portal WITHOUT Docker, against a PostgreSQL server installed on this machine.
// Used by the start launchers when Docker is not found. Usage: node scripts/run-local.mjs [--no-open] [--prepare]
// --prepare does every setup step (database, dependencies, tables, build) and exits without serving;
// the Windows service (scripts/watchdog.ps1) uses it so the unattended start never has to ask questions.
//
// Needs: Node 20.19+ and a running PostgreSQL. It creates the "sheep" database user and
// "sheep_portal" database if missing (asking for the PostgreSQL admin password if required),
// installs dependencies, builds the site when sources changed, then serves it in the foreground.
// Closing the window / Ctrl+C stops the portal. Set PORT to change the port (default 3000).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import readline from "node:readline";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const isWin = process.platform === "win32";
const PORT = process.env.PORT || "3000";
const NO_OPEN = process.argv.includes("--no-open");
const PREPARE_ONLY = process.argv.includes("--prepare");
const DEFAULT_URL = "postgresql://sheep:sheep@127.0.0.1:5432/sheep_portal?schema=public";

const NEXT_BIN = join("node_modules", "next", "dist", "bin", "next");
const PRISMA_BIN = join("node_modules", "prisma", "build", "index.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`\n==> ${message}`);
}

// Run a Node-based tool (next / prisma) with the current Node, failing loudly.
function runNode(script, args, label) {
  const r = spawnSync(process.execPath, [script, ...args], { stdio: "inherit", env: process.env });
  if (r.status !== 0) die(`${label} failed (see messages above).`);
}

// ---------- database URL ----------

function readEnvFileUrl() {
  if (!existsSync(".env")) return null;
  const m = readFileSync(".env", "utf8").match(/^\s*DATABASE_URL\s*=\s*(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

const fromEnv = process.env.DATABASE_URL;
const fromFile = readEnvFileUrl();
const DATABASE_URL = fromEnv || fromFile || DEFAULT_URL;
process.env.DATABASE_URL = DATABASE_URL;

let parsed;
try {
  parsed = new URL(DATABASE_URL);
} catch {
  die(`DATABASE_URL is not a valid PostgreSQL address: ${DATABASE_URL}`);
}
const dbHost = parsed.hostname || "127.0.0.1";
const dbPort = parsed.port || "5432";
const dbUser = decodeURIComponent(parsed.username);
const dbPass = decodeURIComponent(parsed.password);
const dbName = decodeURIComponent(parsed.pathname.slice(1));
// libpq rejects Prisma's "?schema=public", so give psql the URL without the query.
const psqlUri = `postgresql://${parsed.username}:${parsed.password}@${dbHost}:${dbPort}/${parsed.pathname.slice(1)}`;

// Make `npm run import:farmers` etc. work from a terminal later on.
if (!fromEnv && !fromFile) {
  const line = `DATABASE_URL="${DEFAULT_URL}"\n`;
  if (existsSync(".env")) appendFileSync(".env", `\n${line}`);
  else writeFileSync(".env", line);
}

// ---------- PostgreSQL helpers ----------

function tcpOpen(host, port) {
  return new Promise((done) => {
    const s = net.connect({ host, port: Number(port) });
    s.setTimeout(3000);
    s.once("connect", () => (s.destroy(), done(true)));
    s.once("error", () => done(false));
    s.once("timeout", () => (s.destroy(), done(false)));
  });
}

function findPsql() {
  const exe = isWin ? "psql.exe" : "psql";
  if (spawnSync(exe, ["--version"], { stdio: "ignore" }).status === 0) return exe;
  if (isWin) {
    const base = join(process.env.ProgramFiles || "C:\\Program Files", "PostgreSQL");
    if (existsSync(base)) {
      for (const v of readdirSync(base).sort((a, b) => parseFloat(b) - parseFloat(a))) {
        const p = join(base, v, "bin", "psql.exe");
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

const sqlStr = (s) => `'${s.replace(/'/g, "''")}'`;
const sqlId = (s) => `"${s.replace(/"/g, '""')}"`;

function askHidden(question) {
  return new Promise((done) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: stdin });
      rl.question("", (a) => (rl.close(), done(a)));
      return;
    }
    let text = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return done(text);
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f" || c === "\b") text = text.slice(0, -1);
        else text += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function ensureDatabase() {
  step(`Checking PostgreSQL at ${dbHost}:${dbPort}`);
  if (!(await tcpOpen(dbHost, dbPort))) {
    die(
      `PostgreSQL is not running on ${dbHost}:${dbPort}.\n` +
        (isWin
          ? `Install it from https://www.postgresql.org/download/windows/ (keep the default port 5432),\nor start the "postgresql-x64-..." service in the Windows Services app.`
          : `Install it (e.g. "sudo apt install postgresql") or start it ("sudo systemctl start postgresql").`) +
        `\nAlternatively, install Docker and run the start launcher again.`
    );
  }

  const PSQL = findPsql();
  if (!PSQL) {
    console.log("psql was not found, so the database user cannot be checked or created automatically.");
    console.log("Continuing; if the next step fails, create the database and user by hand (see README).");
    return;
  }

  const run = (extraArgs, extraEnv) =>
    spawnSync(PSQL, ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-tA", ...extraArgs], {
      encoding: "utf8",
      env: { ...process.env, PGCONNECT_TIMEOUT: "5", ...extraEnv },
    });

  if (run(["-d", psqlUri, "-c", "select 1"]).status === 0) {
    console.log(`Connected as "${dbUser}" to "${dbName}".`);
    return;
  }

  console.log(`Could not log in as "${dbUser}" to "${dbName}". Setting it up with the PostgreSQL admin account...`);
  const adminUser = process.env.SHEEP_PG_ADMIN_USER || "postgres";
  const adminEnv = (password) => ({
    PGHOST: dbHost,
    PGPORT: dbPort,
    PGUSER: adminUser,
    PGDATABASE: "postgres",
    ...(password ? { PGPASSWORD: password } : {}),
  });
  const viaEnv = (password) => (sql) => run(["-c", sql], adminEnv(password));
  // Linux: the "postgres" OS user can usually connect over the local socket without a password.
  const viaSudo = (sql) =>
    spawnSync("sudo", ["-u", "postgres", PSQL, "-X", "-v", "ON_ERROR_STOP=1", "-tA", "-d", "postgres", "-c", sql], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
    });

  const candidates = [];
  if (process.env.SHEEP_PG_ADMIN_PASSWORD) candidates.push(viaEnv(process.env.SHEEP_PG_ADMIN_PASSWORD));
  candidates.push(viaEnv(null));
  if (!isWin && (dbHost === "127.0.0.1" || dbHost === "localhost")) candidates.push(viaSudo);

  let admin = candidates.find((c) => c("select 1").status === 0);
  for (let attempt = 0; !admin && attempt < 3; attempt++) {
    const pw = await askHidden(`Enter the password of the PostgreSQL "${adminUser}" account (set when PostgreSQL was installed): `);
    const candidate = viaEnv(pw);
    if (candidate("select 1").status === 0) admin = candidate;
    else console.log("That did not work.");
  }
  if (!admin) die(`Could not log in to PostgreSQL as "${adminUser}". Check the password and run again.`);

  const role = admin(
    `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${sqlStr(dbUser)}) THEN ` +
      `CREATE ROLE ${sqlId(dbUser)} LOGIN PASSWORD ${sqlStr(dbPass)}; ` +
      `ELSE ALTER ROLE ${sqlId(dbUser)} LOGIN PASSWORD ${sqlStr(dbPass)}; END IF; END $$;`
  );
  if (role.status !== 0) die(`Could not create the database user:\n${role.stderr}`);

  const exists = admin(`SELECT 1 FROM pg_database WHERE datname = ${sqlStr(dbName)}`);
  if (exists.status !== 0) die(`Could not check for the database:\n${exists.stderr}`);
  if (!exists.stdout.trim()) {
    const created = admin(`CREATE DATABASE ${sqlId(dbName)} OWNER ${sqlId(dbUser)}`);
    if (created.status !== 0) die(`Could not create the database:\n${created.stderr}`);
  }

  if (run(["-d", psqlUri, "-c", "select 1"]).status !== 0) {
    die(`The database was set up but logging in as "${dbUser}" still fails. Check pg_hba.conf allows password logins from ${dbHost}.`);
  }
  console.log(`Database "${dbName}" and user "${dbUser}" are ready.`);
}

// ---------- dependencies and build ----------

function ensureDependencies() {
  const stamp = join("node_modules", ".sheep-lock-hash");
  const hash = createHash("sha1").update(readFileSync("package-lock.json")).digest("hex");
  const installed = existsSync(NEXT_BIN) && existsSync(PRISMA_BIN);
  const stampOk = existsSync(stamp) ? readFileSync(stamp, "utf8") === hash : installed;

  if (installed && stampOk) {
    if (!existsSync(stamp)) writeFileSync(stamp, hash);
    return;
  }
  step("Installing dependencies (first run takes a few minutes)");
  const r = spawnSync("npm ci", { stdio: "inherit", shell: true }); // one string: Node 26 warns when args + shell are combined
  if (r.status !== 0) die("npm could not install the dependencies. Check the internet connection and try again.");
  writeFileSync(stamp, hash);
}

// The Prisma client is generated into src/generated (git-ignored): create it on first run and after
// the schema, config or dependencies change.
function ensureClientGenerated() {
  const generated = mtime(join("src", "generated", "prisma", "client.ts"));
  const inputs = [join("prisma", "schema.prisma"), "prisma.config.ts", "package-lock.json"];
  if (generated && !inputs.some((p) => mtime(p) > generated)) return;
  step("Generating the database client");
  runNode(PRISMA_BIN, ["generate"], "Generating the database client");
}

function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(path).reduce((m, name) => Math.max(m, newestMtime(join(path, name))), 0);
}

function buildIsStale() {
  const built = mtime(join(".next", "BUILD_ID"));
  if (!built) return true;
  const inputs = [
    "src", "public", join("prisma", "schema.prisma"), "package.json", "package-lock.json",
    "next.config.mjs", "tailwind.config.ts", "postcss.config.mjs", "tsconfig.json", "prisma.config.ts",
  ];
  return inputs.some((p) => newestMtime(p) > built);
}

// ---------- start ----------

function openBrowser(url) {
  if (NO_OPEN) return;
  const [cmd, args] = isWin ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {}
}

async function isUp() {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/`)).status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 19)) die(`Node.js 20.19 or newer is required (found ${process.versions.node}).`);

  // Check this first: installing or rebuilding underneath a running portal breaks it (on Windows the
  // running server even locks Prisma's files, so the install fails halfway).
  const url = `http://localhost:${PORT}`;
  if (await tcpOpen("127.0.0.1", PORT)) {
    if (await isUp()) {
      console.log(`\nSheep Portal is already running at ${url}`);
      console.log("To apply an update, close the window it runs in (or press Ctrl+C there) and run this again.");
      openBrowser(url);
      return;
    }
    die(`Port ${PORT} is in use by another program. Close it, or run with a different port (set PORT=3001).`);
  }

  await ensureDatabase();
  ensureDependencies();
  ensureClientGenerated();

  step("Preparing database tables");
  runNode(PRISMA_BIN, ["db", "push"], "Creating the database tables");

  if (buildIsStale()) {
    step("Building the site (about a minute)");
    runNode(NEXT_BIN, ["build"], "Building the site");
  }

  if (PREPARE_ONLY) {
    console.log("\nReady to start.");
    return;
  }

  step(`Starting Sheep Portal on ${url}`);
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", PORT], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 0));

  for (let i = 0; i < 60 && !(await isUp()); i++) await sleep(1000);
  console.log(`\nSheep Portal is running at ${url}`);
  console.log("Keep this window open. Close it (or press Ctrl+C) to stop the portal.");
  openBrowser(url);
}

main().catch((e) => die(String(e?.stack || e)));
