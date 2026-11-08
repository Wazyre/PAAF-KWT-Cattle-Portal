# Sheep Portal — Developer Onboarding

---

## 1. What this app is

A Kuwait-government Arabic (RTL), server-side-rendered, mobile-friendly portal for declaring and auditing livestock (sheep/goats, camels, cows). Three audiences, three portals, one database:

| Portal              | Path              | Who                                                                                     |
| ------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| Farmer declaration  | `/farmer`         | Citizens declare their animals, locations, and head-counts.                             |
| Field supervisor    | `/supervisor`     | Inspectors audit a declaration: chip-reading files, violation status, manual recounts.  |
| Head supervisor     | `/head-supervisor`| Manages the supervisor roster and assigns audit groups to specific supervisors.         |

All UI is Arabic, `dir="rtl"`, with the Cairo font and a Kuwait-government palette (`gov`, `gov-dark`, `gov-light` in the `@theme` block of `src/app/globals.css`). The DB stores ASCII enum values; Arabic labels live in one place: `src/lib/constants.ts`.

---

## 2. Stack at a glance

- **Next.js 14 App Router** with **React Server Components** + Server Actions
- **Prisma 5** + **PostgreSQL 16** (via Docker Compose)
- **Tailwind CSS** for styling, **Cairo** Google font for Arabic
- **Leaflet** + **react-leaflet** + OpenStreetMap tiles for maps
- **TypeScript 7** throughout, `strict` mode
- Native browser print-to-PDF for the audit report (`/supervisor/[id]/print`)

There is no separate API service. Mutations go through Next.js Server Actions in `actions.ts` files colocated with their pages.

---

## 3. Deploying (non-technical)

Needs only [Docker Desktop](https://www.docker.com/products/docker-desktop) on the computer or server that will host the portal.

1. Install Docker Desktop and open it (wait for "Engine running").
2. Double-click **`Start Sheep Portal.bat`**. The first run takes a few minutes; the browser opens by itself when the portal is ready.

That's it. The portal restarts automatically with the computer, and data is kept between restarts.

- **Stop:** double-click `Stop Sheep Portal.bat`.
- **Load the farmer list:** drag a CSV file (civil ID, name) onto `Import Farmers.bat`.
- **Other devices on the network:** open `http://<this-computer's-IP>:3000`.
- **Update to a new version:** replace the project files and double-click `Start Sheep Portal.bat` again.

**Linux:** open a terminal in the project folder and run `./start-sheep-portal.sh` (if it isn't executable, run `bash start-sheep-portal.sh`). If Docker isn't installed, the script offers to install it. Equivalents: `./stop-sheep-portal.sh` and `./import-farmers.sh farmers.csv`. On macOS, `docker compose up -d --build` does the same thing.

**No Docker?** The same launchers automatically fall back to a PostgreSQL server installed on the computer (nothing else to configure). It needs [Node.js 20.19+](https://nodejs.org) and [PostgreSQL](https://www.postgresql.org/download/) running on port 5432. On first run it asks once for the PostgreSQL admin ("postgres") password to create the `sheep` user and `sheep_portal` database, installs dependencies, builds the site and opens the browser. Differences from the Docker mode:

- The portal runs in the window that opens; closing the window (or Ctrl+C) stops it. It does not start by itself after a restart.
- After updating the project files, run the launcher again; it rebuilds automatically when the code changed.
- To use a different database, put your own `DATABASE_URL` in `.env`; `PORT=3001` changes the port. `npm run start:local` does the same as the launcher.
- Re-running the launcher resets the `sheep` user's password to the one in `DATABASE_URL`.

Demo citizens/supervisors are *not* loaded in this mode. To add them: `docker compose exec app npm run db:seed`.

---

## 3a. Running as an always-on Windows service

Use this when the portal lives on a Windows PC or server and another server on the network forwards your subdomain to it. Double-click **`Install Sheep Portal Service.bat`** (it asks for administrator permission) and answer two questions: the public address (for example `portal.example.gov.kw`) and the IP of the forwarding server. It then:

- does the one-time setup (database, packages, build), so the unattended service never asks anything;
- registers a **"Sheep Portal"** scheduled task that starts at boot (no one needs to log in) and runs `scripts/watchdog.ps1`;
- opens Windows Firewall for port 3000 to that IP only;
- registers a **"Sheep Portal Backup"** task that writes a database dump to `backups\` at 02:00 and keeps 14 days.

**What the watchdog does.** It checks `/api/health` every 20 seconds. It restarts the portal if the process exits or three checks in a row fail, waits longer between attempts if it keeps failing right after starting, and clears a leftover web server if it was itself killed. If PostgreSQL is down or still starting at boot, it keeps retrying; once the database is back, the portal recovers on its own. Everything is logged in `logs\` (`watchdog.log`, `prepare.log`, one `portal-*.log` per start).

**Which mode.** With Docker running when you install, it runs the containers (and starts at *your* login, because Docker Desktop only runs while someone is logged in; enable auto-login for the account if the PC reboots unattended). Otherwise it uses Node and the PostgreSQL installed on the machine and starts at boot.

**The forwarding server** should send traffic to `http://<this-pc>:3000` and pass the original `Host` header (nginx: `proxy_set_header Host $host;`). If it cannot, the address you entered is saved as `ALLOWED_ORIGINS` in `.env`, which is what lets form submissions through.

**HTTPS on the portal itself (no `:3000` in the address).** If the address points straight at this PC instead of at a forwarding server, the portal can serve HTTPS on port 443 by itself (and send port 80 to https). You need a certificate issued for the address (for example `selfdeclaration.paaf.gov.kw`) by PAAF IT or a certificate authority; the portal cannot make one. Put the files in a folder only administrators can read (for example `C:\certs\`) and add to `.env`:

```
TLS_CERT_FILE=C:\certs\selfdeclaration.pem   # the certificate followed by its intermediate certificates ("fullchain")
TLS_KEY_FILE=C:\certs\selfdeclaration.key
# or one Windows .pfx file instead of the two lines above:
# TLS_PFX_FILE=C:\certs\selfdeclaration.pfx
# TLS_PFX_PASSPHRASE=<its password>
```

Then open the ports and restart (PowerShell as administrator):

```powershell
New-NetFirewallRule -DisplayName "Sheep Portal HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443,80 -Action Allow
schtasks /End /TN "Sheep Portal"; schtasks /Run /TN "Sheep Portal"
```

The watchdog starts the HTTPS listener (`scripts\https-proxy.mjs`) next to the portal and keeps it running; its messages are in `logs\https.log`. A renewed certificate is picked up within a minute of replacing the files, with no restart. Visitors can still reach `:3000` unless you remove that firewall rule (`Remove-NetFirewallRule -DisplayName "Sheep Portal"`), which you should do once nothing else needs it. Sign-in cookies are marked Secure automatically. A chain that lacks the intermediate shows as a warning in some browsers, so include it in the PEM file. This runs only in the Windows-service local mode; with Docker, terminate HTTPS on the forwarding server.

Day to day (PowerShell as administrator, from the project folder):

```powershell
Get-Content logs\watchdog.log -Tail 20          # what the watchdog has done
schtasks /End /TN "Sheep Portal"                # stop (the web server stops with it)
schtasks /Run /TN "Sheep Portal"                # start again; this also applies an update after `git pull`
powershell -File scriptsackup.ps1 -Mode local # backup now (-Mode docker if you use Docker)
```

To update: `git pull`, then stop and start the task as above (it rebuilds when the code changed). In Docker mode run `docker compose up -d --build` instead. To remove the service, run **`Uninstall Sheep Portal Service.bat`**; the data and backups stay.

**`npm run db:generate` fails with "EPERM" / "rmdir operation not permitted".** Windows will not delete `src\generated\prisma` while a running portal has it open, or when the service (which runs as SYSTEM) created it and your account may not delete it. The service already runs `generate` and `db push` on every start, so you rarely need them by hand: stop and start the task (above). If you do need to run it, stop the task first (`schtasks /End /TN "Sheep Portal"`, then check no `node.exe` for this folder remains) and use an administrator PowerShell. Adding farmers never needs `db:generate`: use `npm run import:farmers -- file.csv`.

Restore a backup (local mode): `pg_restore --clean --if-exists -h 127.0.0.1 -U sheep -d sheep_portal backups\<file>.dump`. Copy `backups\` to another machine regularly: a backup on the same disk does not survive losing the disk.

### Security: read before exposing it

- **Every portal requires sign-in through PACI** (see section 3c). The farmer portal, the investigator portal, the head-investigator portal and the CSV exports each check the signed-in role on the server, so a person can only open the portal their civil ID belongs to, and a farmer only ever sees their own declaration.
- **Investigators see only their assigned groups.** An investigator can open, save an audit for, or print only the declarations in groups the head investigator assigned to them (the same farmers their schedule lists); anything else looks like a missing record. Head investigators can open everything. One deliberate exception: an audit page lists nearby farmers' names and civil IDs in its proximity alerts, because that is how suspicious locations are caught.
- **Superusers** can open all three portals and every declaration, audit, head-investigator tool and export, and the farmer form is never closed to them by the registration/update switches. They sign in through PACI like everyone else. Manage them only on the server: `npm run superuser -- add <civil id> "<name>"`, `npm run superuser -- remove <civil id>`, `npm run superuser -- list`. Removing one takes effect immediately, even for a session that is already signed in. A superuser has no investigator schedule of their own (the investigator page points them to the head investigator portal) and a declaration they submit in the farmer portal is stored under their own civil ID. Each superuser sign-in is written to the server log (last four digits only). Keep this list as short as possible.
- Sign-in attempts are limited (10 per address per 10 minutes, one PACI request per civil ID per 30 seconds), but add rate limiting on the forwarding server too.
- The portal itself speaks plain HTTP. Either turn on its HTTPS listener (above), or terminate HTTPS on the forwarding server and keep port 3000 reachable only from it (the firewall rule above). Pass `X-Forwarded-Proto: https` so the session cookie is marked Secure (or set `COOKIE_SECURE=true`).
- Server-side fetching of Google Maps short links is restricted to Google's own hosts.

---

## 3c. Signing in (PACI)

The home page `/` is the only entrance. A person types their civil ID, the portal asks PACI to send a confirmation request to their phone, waits for the answer, and then opens the portal that matches the ID in the database:

| The civil ID is in table | Role                      | Goes to            |
| ------------------------ | ------------------------- | ------------------ |
| `Citizen`                | Farmer (مربّي)            | `/farmer`          |
| `Supervisor`             | Investigator (مفتش)       | `/supervisor`      |
| `HeadSupervisor`         | Head investigator (رئيس)  | `/head-supervisor` |

An ID in more than one table gets a chooser. An ID in none is turned away **before** PACI is contacted ("not registered"), so nobody receives a request they cannot use. Other outcomes shown to the person: request refused in the app, no answer in time (default 2 minutes), PACI unavailable, PACI rejected the request, too many attempts, or a request already pending.

**Before go-live, load everyone:**

```bash
npm run import:farmers -- farmers.csv     # civilId,name
npm run import:staff   -- staff.csv       # civilId,name,role   (role: investigator | head)
```

Both accept `--dry-run`. The head investigator can also add or remove investigators in their portal.

**The PACI exchange** (`src/lib/paci.ts`, `src/app/api/paci/callback/route.ts`):

1. The portal POSTs `{CivilID, ServiceDescAr, ServiceDescEn, AuthReassonAR, AuthReassonEn}` to `https://kmidinteg.paaf.gov.kw/api/PACI/Auth`. PACI pushes a request to the phone.
2. **The answer.** PACI posts the person's result to the PAAF e-services portal (`paciCall`). While a sign-in is waiting, the portal asks that same address every 4 seconds: `POST {"CivilID": "<request id>", "flag": "True"}`. It replies `CallBackResSuccessFlag: "True"` only once PACI reported an approval (and `"False"` for a pending or unknown request), and only then is the person signed in. A request nobody approves ends as "no answer in time" after `PACI_TIMEOUT_SECONDS`. PAAF restricts which servers may call `paciCall`: if the log says `FORBIDDEN_SOURCE`, ask PAAF to allow this server's public address. Their certificate lacks the Sectigo intermediate, so the repo ships `certs/sectigo-dv-r36.pem` (public) and the portal trusts it in addition to the normal list; certificate checking stays on.
3. **Optional callback.** The portal also accepts PACI's result at `/api/paci/callback` (and `/paafPortal/resourc/paciCall`) as `{"CivilID": "<request id>", "flag": "True" | "False"}`. This only matters if PAAF forwards results here; it is the only way to learn quickly that someone *declined*, since the e-services check answers `False` for both pending and declined. Set `PACI_RESULT_POLL=off` to use the callback alone.

- **Sign-in links in Sahel notifications.** The "Register Now" button of a notification can carry the person's civil ID so they never type it: `https://<portal>/?c=<civil id>&k=<signature>`. Opening it sends the PACI request immediately and removes the ID from the address bar; the person still has to approve on their phone. The signature (made with `ENTRY_LINK_SECRET` in `.env`: a long random text, keep it private) stops anyone from writing a link for another person's civil ID; a link with a wrong signature just shows the normal form. Make links on the server:

  ```
  npm run make:links -- --base https://selfdeclaration.paaf.gov.kw 287101505009
  npm run make:links -- --base https://selfdeclaration.paaf.gov.kw --file ids.txt   # one civil ID per line
  ```

  Each line prints `civilId,link`; the link goes in `actionUrl` of the notification for that person. Links do not expire; changing `ENTRY_LINK_SECRET` cancels every link issued so far. Without `ENTRY_LINK_SECRET` links are not recognised and the form is shown.
- **Sending the notifications.** `npm run notify` builds the agreed Sahel messages, puts each person's signed link in the button, and sends them through the Sahel service. The messages are `register`, `confirmed`, `reminder`, `final-warning` and `field-visit` (run `npm run notify -- --help` for what each one needs). Examples:

  ```
  # preview, nothing is sent
  npm run notify -- --template reminder --deadline "15 December 2026" --contact "Hotline 1234" --unregistered --dry-run
  # test service (accepts only the Sahel test civil ID 287101505009)
  npm run notify -- --template reminder --deadline "15 December 2026" --contact "Hotline 1234" 287101505009
  # production: first a preview, then the same command with --yes; --limit 5 is a careful way to start
  npm run notify -- --template reminder --deadline "15 December 2026" --contact "Hotline 1234" --unregistered --prod
  npm run notify -- --template reminder --deadline "15 December 2026" --contact "Hotline 1234" --unregistered --prod --yes
  ```

  Who gets it: civil IDs on the command line, `--file ids.txt`, `--unregistered` (citizens in the database without a declaration) or `--registered`. `--no-link` sends the message with an empty `actionUrl` (no secret or address needed) and `--no-button` sends it with no button at all. Nothing goes to the production service without both `--prod` and `--yes`. Every send is recorded in `logs\sahel-sent.csv`, and a person who already received a message is skipped on a repeat run unless you pass `--resend`; five failures in a row stop the run. Settings in `.env`: `ENTRY_LINK_SECRET`, `PORTAL_URL` (the address in the links), and optionally `SAHEL_URL_TEST`, `SAHEL_URL_PROD`, `SAHEL_AUTH_HEADER`.
- **The Auth reply.** PACI answers `{SubmitResult, HasIdentity, Erorr, CivilID}` ("Erorr" is their spelling). When the request is submitted, `SubmitResult` holds the request id (a GUID) and `CivilID` is the civil number. `HasIdentity` false shows "no digital identity", and `SubmitResult` false shows "could not send". The server log records these values and only the first 8 characters of the id.

Settings in `.env` (all optional):

| Variable               | Meaning                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `PACI_MODE`            | `live` (default) or `mock`. **`mock` approves automatically: testing only, never on a real server.** In mock mode an ID ending in 9 is refused and one ending in 8 never answers. |
| `PACI_AUTH_URL`        | Auth endpoint (default: the `kmidinteg` address above).                                              |
| `PACI_AUTH_HEADER`     | A credential header if PACI requires one, as `Name: value`.                                          |
| `PORTAL_URL`           | Address put in the Sahel links, e.g. `https://selfdeclaration.paaf.gov.kw` (`npm run notify`).        |
| `SAHEL_URL_TEST`, `SAHEL_URL_PROD`, `SAHEL_AUTH_HEADER` | The Sahel notification service addresses (defaults are PAAF's) and an optional `Name: value` header. |
| `ENTRY_LINK_SECRET`    | Secret that signs the sign-in links for Sahel notifications (`npm run make:links`).                  |
| `TLS_CERT_FILE`, `TLS_KEY_FILE` (or `TLS_PFX_FILE`, `TLS_PFX_PASSPHRASE`) | Certificate files; when set, the Windows service serves HTTPS on port 443 (`HTTPS_PORT`). |
| `PACI_RESULT_URL`      | The e-services `paciCall` address (default: PAAF's).                                                 |
| `PACI_RESULT_POLL`     | `off` to stop asking e-services and rely on the callback only.                                       |
| `PACI_TIMEOUT_SECONDS` | How long a person has to approve (default 120).                                                      |
| `PACI_CALLBACK_SECRET` | If set, callbacks without `?key=<secret>` are rejected.                                              |
| `SESSION_SECRET`       | Signs the session cookie. Optional: a random key is generated and kept in the database.             |

For local testing without PACI, add `PACI_MODE="mock"` to `.env` (the file `.env.example` already has it). A session lasts 8 hours; the header has a sign-out button.

---

## 3b. Developer setup (≈15 minutes)

Prerequisites: Node 20.19+, Docker Desktop, Git.

```bash
git clone <repo>
cd "Sheep Portal"
cp .env.example .env              # uses 127.0.0.1, not localhost — see §10
npm run db:up                     # starts only Postgres, published on 127.0.0.1:5432 (docker-compose.dev.yml)
npm install
npm run db:generate                # generates the Prisma client into src/generated (git-ignored)
npm run db:push                   # creates the schema in the running DB
npm run db:seed                   # adds the demo citizens & supervisors
npm run dev                       # http://localhost:3000 (also re-generates the client)
```

**Demo credentials** (from `prisma/seed.ts`):

Use `PACI_MODE="mock"` in `.env` (section 3c), then sign in at `/` with:

- Farmer: `287010112345` (عبدالله سالم أحمد) or any of the other 5.
- Investigator: `289050133211` (علي أحمد حسن) or any of the other 3.
- Head investigator: `280020577001` (سليمان ناصر العتيبي).

Assigning a group in the head-investigator portal is what makes it appear in an investigator's queue.

---

## 4. End-to-end flow 

1. **Farmer declares.** Sign in at `/` with civil ID `287010112345` (you land on `/farmer`). The form (`src/app/farmer/DeclarationForm.tsx`) lets you add animal-type groups, then locations per group. Use a Google Maps share link in the location field; the server expands short links and extracts lat/lng (`src/lib/geo.ts`). Submit → redirected to `/farmer/success/[id]` with a transaction number.
2. **Head supervisor assigns.** Sign in as the head investigator (`280020577001`) and open `/head-supervisor`; add a supervisor if needed (`SupervisorManager`), then assign the farmer's gathering-point group (`AssignControl`) to a supervisor. Groups split into "SMALL" (≤750 head, bundled by gathering point) and "SOLO" (one farmer with >750 head).
3. **Supervisor audits.** Sign in as the assigned investigator (for example `289050133211`). You'll land on `/supervisor` and see the assigned groups; click one to open `/supervisor/[id]`. Upload `public/sample-chip-readings.txt` as the chip file, pick a violation status, save. The server parses the chip file (`src/lib/chips.ts`), keeps only readings inside the start/end window, flags rule violations, and persists via `submitAudit`.
4. **Print.** From the audit page, click the print link → `/supervisor/[id]/print` is a server-rendered, print-stylesheet-friendly view that the browser turns into a PDF.

---

## 5. Repository map

```
src/
  app/                              Next.js App Router routes
    page.tsx                        Landing page with three portal cards
    layout.tsx                      Root layout: RTL <html>, header, footer
    farmer/
      page.tsx                      The signed-in farmer's form, prefilled
      DeclarationForm.tsx           "use client" — multi-group/multi-location form
      actions.ts                    submitDeclaration server action
      success/[id]/page.tsx         Post-submit confirmation
    supervisor/
      page.tsx                      The signed-in investigator's assigned groups
      ScheduleRow.tsx               Client-side clickable <tr>
      MapLink.tsx                   Lat/lng → Google Maps deep link
      [id]/
        page.tsx                    Thin shell -> AuditPageContent
        AuditPageContent.tsx        Server component: assemble all audit data
        AuditForm.tsx               "use client" — the audit form
        ChipFlagsTable.tsx          "use client" — flag individual chip readings
        actions.ts                  submitAudit + updateChipFlags
        print/page.tsx              Print-friendly view
    head-supervisor/
      page.tsx                      Roster + assignment matrix
      SupervisorManager.tsx         Add/remove supervisors
      AssignControl.tsx             Assign a group to a supervisor
      actions.ts                    assignGroup / addSupervisor / removeSupervisor
      [id]/page.tsx                 Read-only audit view for the head
    api/resolve-location/route.ts   Server endpoint that expands short links
                                    and extracts lat/lng (used by the client form)
  components/
    BrandLogo.tsx                   /logo.png with SVG fallback
    DatePicker.tsx                  Custom DD-MM-YYYY calendar (ISO in hidden input)
    TimePicker.tsx                  Custom hh:mm:ss dropdown (HH:mm:ss in hidden input)
    DeclarationView.tsx             Read-only render of a declaration
    MapView.tsx                     Leaflet map (dynamic import, client only)
    PrintButton.tsx                 window.print() trigger
    icons.tsx                       Inline outline SVG icons (no icon library)
  lib/
    prisma.ts                       Singleton PrismaClient (dev hot-reload-safe)
    identity.ts                     resolveIdentity(civilId) — swap for PACI later
    constants.ts                    Enum -> Arabic label tables, thresholds
    phone.ts                        Kuwait mobile validation (8 digits, ^[569]\d{7}$)
    geo.ts                          parseLatLng / expandShortLink / distanceMeters
    chips.ts                        processChipFile — parsing + windowing + flags
    proximity.ts                    findProximityHits — 5m cross-farmer check
prisma/
  schema.prisma                     Full data model (§7)
  seed.ts                           Demo citizens + supervisors
public/
  logo.png                          PAAFR logo
  sample-chip-readings.txt          Demo chip file covering every rule
docker-compose.yml                  Postgres 16 + the app (no host DB port)
docker-compose.dev.yml              Dev override: publishes Postgres on 127.0.0.1:5432
.env.example                        DATABASE_URL using 127.0.0.1 (NOT localhost)
```

---

## 6. The three big mental models

### 6a. Server Components by default; `"use client"` only where state is needed

Pages (`page.tsx`) are async server components: they hit Prisma directly. Forms with local state (`DeclarationForm`, `AuditForm`, `ChipFlagsTable`, the pickers, `ScheduleRow`) carry `"use client"` at the top.

Mutations are **Server Actions** in `actions.ts` files. They run on the server, return a state object (`{ error?: string }`), and end with `redirect()` on success. The client forms use the canonical pattern:

```tsx
<form action={asyncFn} noValidate>
  ...
  <SubmitButton />  // reads pending from useFormStatus()
</form>
```

This was a bug-fix from an earlier iteration that tried `useFormState` + `useTransition`; that combo gets stuck on same-route redirects. **Do not regress to it.**

### 6b. ASCII enums in DB, Arabic labels in one file

Prisma enums (`AnimalType`, `GatheringPoint`, `ViolationStatus`, `DifferenceReason`, `GroupType`) are stored as ASCII identifiers. Every Arabic label is in `src/lib/constants.ts` with helper functions (`gatheringPointLabel`, `animalTypeLabel`, ...). **Never inline Arabic enum labels in components** — import from `constants.ts`.

### 6c. Identity is one function away from PACI

`src/lib/identity.ts::resolveIdentity` currently looks up the seeded `Citizen` table. The comment is explicit: replace the body with a PACI/Sahel SSO call and nothing else in the app changes. Treat that file as the integration seam.

---

## 7. Data model (read once)

The shape that matters:

```
Declaration (1) ──── (many) AnimalGroup ──── (many) FarmLocation
     │                                                 ▲
     │                                                 │ same lat/lng <5m
     ▼                                                 │ trips proximity check
   Audit (0..1) ──── (many) AuditAnimalResult ──── (many) ChipReading
```

- `Declaration` is keyed by civil ID (unique). Edits create a `DeclarationRevision` snapshot before overwriting.
- `AuditAnimalResult` is unique per `(audit, animalType, siteIndex)` — that's how the supervisor records one verdict per "this farmer's camels at site #2".
- `ChipReading` has four independent flags: `flaggedSymbol`, `flaggedProximity`, `flaggedMultipleChips`, `flaggedDoesntBelong`. The first two come from the file parser (`src/lib/chips.ts`); the last two are toggled by the supervisor in `ChipFlagsTable`.
- `Assignment.groupKey` is a synthetic uniqueness key — `${animalType}_${gatheringPoint}_SMALL` or `..._SOLO_${declarationId}` — so upserts and re-assignments are idempotent.

Schema source of truth: `prisma/schema.prisma`.

---

## 8. Chip-file format & rules (the audit's core algorithm)

Each line: `DDMMYYYY,HHmmss,<chipNumber>` (commas, no spaces required). See `public/sample-chip-readings.txt` for a demo file that exercises every rule.

`src/lib/chips.ts::processChipFile(content, startMs?, endMs?)`:

1. Lines failing the format are collected as `invalidLines` (1-indexed).
2. If a `[start, end]` window is provided, readings outside it are dropped (`discardedOutOfWindow`).
3. A chip whose `rawChip` contains anything outside `[0-9A-Za-z]` is **flaggedSymbol** (the supervisor's "stars" rule for multi-chip animals).
4. Two readings whose `ms` difference is ≤ `PROXIMITY_SECONDS * 1000` (5s) are both **flaggedProximity**.

`AuditPageContent` then computes `multipleChipsCount` by counting *runs* of consecutive starred readings (a clump of stars = one animal that was scanned multiple times).

Cross-farmer proximity (different code path): `src/lib/proximity.ts::findProximityHits` warns the supervisor when another farmer's declared location is within `PROXIMITY_METERS` (5m). Uses the haversine in `src/lib/geo.ts::distanceMeters`.

---

## 9. Common scripts

```bash
npm run dev          # next dev with hot reload
npm run build        # prisma generate + next build
npm run start        # production server (run build first)

npm run db:generate  # regenerate the Prisma client (after changing schema.prisma)
npm run db:push      # push schema.prisma to the DB (no migration history)
npm run db:seed      # tsx prisma/seed.ts — adds demo citizens & supervisors
npm run db:reset     # prisma migrate reset --force — DESTRUCTIVE, dev only

npx tsc --noEmit     # type-check without emitting
npx prisma studio    # GUI on the DB at :5555
```
