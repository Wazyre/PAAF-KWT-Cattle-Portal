# Sheep Portal — Developer Onboarding

---

## 1. What this app is

A Kuwait-government Arabic (RTL), server-side-rendered, mobile-friendly portal for declaring and auditing livestock (sheep/goats, camels, cows). Three audiences, three portals, one database:

| Portal              | Path              | Who                                                                                     |
| ------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| Farmer declaration  | `/farmer`         | Citizens declare their animals, locations, and head-counts.                             |
| Field supervisor    | `/supervisor`     | Inspectors audit a declaration: chip-reading files, violation status, manual recounts.  |
| Head supervisor     | `/head-supervisor`| Manages the supervisor roster and assigns audit groups to specific supervisors.         |

All UI is Arabic, `dir="rtl"`, with the Cairo font and a Kuwait-government palette (`gov`, `gov-dark`, `gov-light` in `tailwind.config.ts`). The DB stores ASCII enum values; Arabic labels live in one place: `src/lib/constants.ts`.

---

## 2. Stack at a glance

- **Next.js 14 App Router** with **React Server Components** + Server Actions
- **Prisma 5** + **PostgreSQL 16** (via Docker Compose)
- **Tailwind CSS** for styling, **Cairo** Google font for Arabic
- **Leaflet** + **react-leaflet** + OpenStreetMap tiles for maps
- **TypeScript 5.6** throughout, `strict` mode
- Native browser print-to-PDF for the audit report (`/supervisor/[id]/print`)

There is no separate API service. Mutations go through Next.js Server Actions in `actions.ts` files colocated with their pages.

---

## 3. First-time setup (≈15 minutes)

Prerequisites: Node 18+, Docker Desktop, Git.

```bash
git clone <repo>
cd "Sheep Portal"
cp .env.example .env              # uses 127.0.0.1, not localhost — see §10
docker compose up -d              # starts Postgres on :5432
npm install
npx prisma db push                # creates the schema in the running DB
npm run db:seed                   # adds the demo citizens & supervisors
npm run dev                       # http://localhost:3000
```

**Demo credentials** (from `prisma/seed.ts`):

- Farmer civil IDs: try `287010112345` (عبدالله سالم أحمد) or any of the other 5.
- Supervisor civil IDs: try `289050133211` (علي أحمد حسن) or any of the other 3.

The head-supervisor portal at `/head-supervisor` has no login gate yet; it is open by URL. Assigning a group there is what makes it appear in a supervisor's queue.

---

## 4. End-to-end flow 

1. **Farmer declares.** Go to `/farmer`, enter civil ID `287010112345`. The form (`src/app/farmer/DeclarationForm.tsx`) lets you add animal-type groups, then locations per group. Use a Google Maps share link in the location field; the server expands short links and extracts lat/lng (`src/lib/geo.ts`). Submit → redirected to `/farmer/success/[id]` with a transaction number.
2. **Head supervisor assigns.** Go to `/head-supervisor`, add a supervisor if needed (`SupervisorManager`), then assign the farmer's gathering-point group (`AssignControl`) to a supervisor. Groups split into "SMALL" (≤750 head, bundled by gathering point) and "SOLO" (one farmer with >750 head).
3. **Supervisor audits.** Go to `/supervisor`, enter the assigned supervisor's civil ID. You'll see the assigned groups; click one to open `/supervisor/[id]`. Upload `public/sample-chip-readings.txt` as the chip file, pick a violation status, save. The server parses the chip file (`src/lib/chips.ts`), keeps only readings inside the start/end window, flags rule violations, and persists via `submitAudit`.
4. **Print.** From the audit page, click the print link → `/supervisor/[id]/print` is a server-rendered, print-stylesheet-friendly view that the browser turns into a PDF.

---

## 5. Repository map

```
src/
  app/                              Next.js App Router routes
    page.tsx                        Landing page with three portal cards
    layout.tsx                      Root layout: RTL <html>, header, footer
    farmer/
      page.tsx                      Civil-ID gate + load existing declaration
      DeclarationForm.tsx           "use client" — multi-group/multi-location form
      actions.ts                    submitDeclaration server action
      success/[id]/page.tsx         Post-submit confirmation
    supervisor/
      page.tsx                      Supervisor login + assigned groups
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
docker-compose.yml                  Postgres 16 on :5432
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
npm run lint         # next lint

npm run db:push      # push schema.prisma to the DB (no migration history)
npm run db:seed      # tsx prisma/seed.ts — adds demo citizens & supervisors
npm run db:reset     # prisma migrate reset --force — DESTRUCTIVE, dev only

npx tsc --noEmit     # type-check without emitting
npx prisma studio    # GUI on the DB at :5555
```
