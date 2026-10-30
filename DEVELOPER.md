# Sheep Portal — Developer Reference

Reference documentation for the Sheep Portal codebase. For a guided onboarding walkthrough, see `README.md`.

## Contents

1. [Project overview](#1-project-overview)
2. [Technology stack](#2-technology-stack)
3. [Configuration](#3-configuration)
4. [Directory layout](#4-directory-layout)
5. [Domain model](#5-domain-model)
6. [Route inventory](#6-route-inventory)
7. [Server actions](#7-server-actions)
8. [API endpoints](#8-api-endpoints)
9. [Library modules](#9-library-modules)
10. [Component inventory](#10-component-inventory)
11. [Business rules](#11-business-rules)
12. [Build, test, and database commands](#12-build-test-and-database-commands)
13. [Styling and theming](#13-styling-and-theming)
14. [Static assets](#14-static-assets)

---

## 1. Project overview

The Sheep Portal is a Next.js 14 web application that supports three workflows:

- **Farmer self-declaration**: citizens declare their livestock, farm locations, and head counts.
- **Field-supervisor audit**: inspectors upload chip-reading files, set violation status, and record manual recounts per site.
- **Head-supervisor management**: supervisors are added/removed and audit groups are assigned to supervisors.

The user interface is in Arabic with `dir="rtl"` set at the root. The application is server-side rendered, mobile-friendly, and uses a single PostgreSQL database via Prisma.

## 2. Technology stack

| Layer        | Technology                                  | Version    |
| ------------ | ------------------------------------------- | ---------- |
| Runtime      | Node.js                                     | ≥ 18       |
| Framework    | Next.js (App Router, Server Actions)        | 14.2.18    |
| Language     | TypeScript                                  | 5.6.3      |
| UI runtime   | React                                       | 18.3.1     |
| Styling      | Tailwind CSS                                | 3.4.14     |
| Typography   | `next/font/google` — Cairo                  | —          |
| ORM          | Prisma + `@prisma/client`                   | 5.22.0     |
| Database     | PostgreSQL (Docker image `postgres:16-alpine`) | 16     |
| Maps         | Leaflet + react-leaflet + OpenStreetMap tiles | 1.9.4 / 4.2.1 |
| Build tools  | `tsx` (seed runner), PostCSS, Autoprefixer  | —          |

## 3. Configuration

### Environment variables

`.env.example`:

```
DATABASE_URL="postgresql://sheep:sheep@127.0.0.1:5432/sheep_portal?schema=public"
```

`DATABASE_URL` is the only required environment variable. The host is `127.0.0.1` (not `localhost`) so Node and Prisma resolve to IPv4. The Postgres container does not bind to IPv6 `::1`.

### Docker

`docker-compose.yml` defines a single service:

| Field        | Value                       |
| ------------ | --------------------------- |
| image        | `postgres:16-alpine`        |
| container    | `sheep_portal_db`           |
| user/pass    | `sheep` / `sheep`           |
| database     | `sheep_portal`              |
| port mapping | `5432:5432`                 |
| volume       | `sheep_portal_pgdata`       |

### Next.js configuration

`next.config.mjs`:

- `reactStrictMode: true`
- `experimental.serverActions.bodySizeLimit: "10mb"` — accommodates chip-file uploads.
- `experimental.serverActions.allowedOrigins: ["localhost:3000", "*.trycloudflare.com"]` — supports Cloudflare Tunnel hosting.

### TypeScript path alias

`@/*` resolves to `src/*` (configured in `tsconfig.json`).

## 4. Directory layout

```
src/
  app/                              Next.js App Router routes
    page.tsx                        Landing page
    layout.tsx                      Root layout (RTL <html>, header, footer)
    globals.css                     Tailwind layers + custom utility classes
    farmer/                         Farmer declaration flow
    supervisor/                     Field-supervisor flow
    head-supervisor/                Head-supervisor flow
    api/resolve-location/route.ts   GET endpoint for lat/lng extraction
  components/                       Shared React components
  lib/                              Pure utilities and singletons
prisma/
  schema.prisma                     Database schema
  seed.ts                           Demo citizens + supervisors
public/
  logo.png                          Authority logo
  sample-chip-readings.txt          Sample chip-reading file
docker-compose.yml                  Postgres service
next.config.mjs                     Next.js config
tailwind.config.ts                  Tailwind config (theme colors, content globs)
postcss.config.mjs                  PostCSS plugins
tsconfig.json                       Strict TypeScript config
.env.example                        Sample environment file
```

## 5. Domain model

Defined in `prisma/schema.prisma`. PostgreSQL provider; Prisma client generated to default location.

### Entities

**Citizen**: seeded national-ID lookup used by `resolveIdentity`.

| Field    | Type   | Notes                 |
| -------- | ------ | --------------------- |
| civilId  | String | Primary key, 12-digit |
| name     | String |                       |

**Declaration**: one farmer's submitted declaration. Unique per civil ID.

| Field     | Type       | Notes                                   |
| --------- | ---------- | --------------------------------------- |
| id        | Int        | Autoincrement PK; used as transaction # |
| civilId   | String     | Unique                                  |
| name      | String     |                                         |
| mobile    | String     |                                         |
| createdAt | DateTime   |                                         |
| updatedAt | DateTime   |                                         |
| lowHeadCount | Boolean | `true` when total declared heads < `LOW_HEAD_THRESHOLD` (50). Set by `submitDeclaration`; `npm run db:backfill-flags` recomputes it. |

Relations: `animalGroups` (1..n), `audit` (0..1), `revisions` (1..n), `soloAssignments` (1..n).

**DeclarationRevision**: snapshot taken before overwriting an existing declaration. Stores prior `mobile` and the previous animal-groups/locations as a JSON blob.

**AnimalGroup**: one (declaration, animalType) tuple. Cascades on declaration delete.

**FarmLocation**: one site within an animal group.

| Field          | Type           | Notes                               |
| -------------- | -------------- | ----------------------------------- |
| gatheringPoint | GatheringPoint | Enum                                |
| latitude       | Float          |                                     |
| longitude      | Float          |                                     |
| locationLink   | String         | Original pasted link or coordinates |
| chippedCount   | Int            | Total chipped animals at this site  |
| males          | Int            |                                     |
| females        | Int            |                                     |
| numTenders     | Int            | Workers/tenders                     |

**Audit**: one per declaration (unique). Cascades on declaration delete. Optionally stores `visitFailureReason` (`VisitFailureReason`: `FARMER_NOT_FOUND`, `LOCATION_NOT_READY`, `TEAM_STOPPED`, `OTHER`) and `visitFailureNote` (free text, only for `OTHER`), entered at the end of `AuditForm` and shown on the print page. `approvedAt` is set by the head investigator (button at the bottom of `/head-supervisor/[id]`) and cleared whenever `submitAudit` saves the audit again.

**AuditAnimalResult**: one record per `(audit, animalType, siteIndex)`. Unique compound key. Stores `violationStatus`, JSON `differenceReasons`, supervisor-entered `locationLink`, optional resolved lat/lng, and an optional `manualCount` override.

**ChipReading**: one parsed line from an uploaded chip file. Cascades on result delete.

| Field                 | Type     | Source                          |
| --------------------- | -------- | ------------------------------- |
| readAt                | DateTime | Parsed from `DDMMYYYY,HHmmss`   |
| chipNumber            | String   | Normalized (alphanumeric only)  |
| rawChip               | String   | Original third field            |
| flaggedSymbol         | Boolean  | Set by `processChipFile`        |
| flaggedProximity      | Boolean  | Set by `processChipFile`        |
| flaggedMultipleChips  | Boolean  | Toggled by `updateChipFlags`    |
| flaggedDoesntBelong   | Boolean  | Toggled by `updateChipFlags`    |

**Supervisor**: field inspector roster.

**Assignment**: mapping of an audit group to a supervisor. Unique by synthetic `groupKey`:

```
${animalType}_${gatheringPoint}_SMALL                  # bundled small farmers
${animalType}_${gatheringPoint}_SOLO_${declarationId}  # one large farmer
```

### Enums

| Enum             | Values                                                             |
| ---------------- | ------------------------------------------------------------------ |
| GatheringPoint   | `WAFRA`, `JAHRA`, `KABD`, `ABDALI`, `MINA_ABDULLAH`                |
| AnimalType       | `SHEEP_GOATS`, `CAMELS`, `COWS`                                    |
| ViolationStatus  | `NONE`, `VIOLATION`                                                |
| GroupType        | `SMALL`, `SOLO`                                                    |
| DifferenceReason | `NOT_CHIPPED`, `UNREADABLE`, `MULTIPLE_CHIPS`, `UNREGISTERED_TRADE`, `SLAUGHTER_DEATH`, `OTHER` |

Arabic labels for each enum value live in `src/lib/constants.ts`. The active set used by the UI is `DIFFERENCE_REASONS` (subset of the database enum): `NOT_CHIPPED`, `MULTIPLE_CHIPS`, `CHIP_DOESNT_BELONG`.

## 6. Route inventory

All page routes are server components with `export const dynamic = "force-dynamic"`.

| Method | Path                              | Description                                              |
| ------ | --------------------------------- | -------------------------------------------------------- |
| GET    | `/`                               | Landing page with three portal cards.                    |
| GET    | `/farmer?civilId=`                | Civil-ID gate; on success, renders `DeclarationForm`.    |
| GET    | `/farmer/success/[id]?updated=`   | Post-submit confirmation with transaction number.        |
| GET    | `/supervisor?civilId=&type=`      | Supervisor login + assigned groups, filtered by type.    |
| GET    | `/supervisor/[id]?saved=&animalType=` | Audit page (uses `AuditPageContent`).                |
| GET    | `/supervisor/[id]/print?animalType=` | Print-friendly audit view.                            |
| GET    | `/head-supervisor?type=`          | Roster manager + assignment matrix.                      |
| GET    | `/head-supervisor/[id]?saved=&animalType=` | Same audit page in `headSupervisorMode`.        |
| GET    | `/api/resolve-location?u=`        | JSON endpoint: extracts lat/lng from a pasted URL.       |

## 7. Server actions

Server actions are async functions in `actions.ts` files, marked with `"use server"`. They take a previous-state object plus `FormData`, return a state object (or `void`), and may `redirect()` on success.

### `src/app/farmer/actions.ts`

```ts
submitDeclaration(_prev: DeclarationState, formData: FormData)
  : Promise<DeclarationState>
```

Validates civil ID via `resolveIdentity`, mobile via `isValidKuwaitMobile`, and a JSON `payload` describing animal groups and locations. Enforces `males + females === chippedCount` per location. If a declaration already exists for the civil ID, snapshots it as a `DeclarationRevision` and overwrites; otherwise creates a new one. Redirects to `/farmer/success/[id]` (with `?updated=1` for updates).

`DeclarationState` is `{ error?: string }`.

### `src/app/supervisor/[id]/actions.ts`

```ts
submitAudit(_prev: AuditState, formData: FormData)
  : Promise<AuditState>
```

Loads the declaration; validates a JSON `animalTypesToProcess` array of `{ type, sites }` against the declaration's animal groups; for each site:

1. Reads `locationLink_{type}_{siteIndex}`, `violationStatus_{type}_{siteIndex}`, `chipFile_{type}_{siteIndex}` (multipart file), `differenceReason_{type}_{siteIndex}` (multi), `manualCount_{type}_{siteIndex}`.
2. Skips the site if both location link and chip readings are empty (no existing chip readings either).
3. Otherwise requires location link, chip readings (uploaded or already persisted), and a valid violation status.
4. Concatenates uploaded file texts; runs `processChipFile`; returns Arabic errors for empty/malformed/no-in-window files.
5. Resolves coordinates via `resolveLocation` (short-link expansion + `parseLatLng`).

All persistence runs inside a single `prisma.$transaction`:

- Upserts the `Audit`.
- Upserts each `AuditAnimalResult` by `(auditId, animalType, siteIndex)`.
- For each site that had a new chip file, deletes prior `ChipReading` rows and `createMany`s the new readings.

Revalidates `/supervisor/[id]` and `/head-supervisor/[id]`. Redirects to `returnTo` (validated against `/^\/(?:head-)?supervisor\/\d+$/`) with `?saved=1` and optional `&animalType=`.

```ts
updateChipFlags(_prev: ChipFlagsState, formData: FormData)
  : Promise<ChipFlagsState>
```

Parses a JSON `flagsPayload` of `{ id, doesntBelong }` entries. Validates IDs belong to the named `resultId`. Updates each row's `flaggedDoesntBelong` in a transaction. Revalidates `/supervisor/[declarationId]`.

### `src/app/head-supervisor/actions.ts`

```ts
assignGroup(formData: FormData): Promise<void>
```

Computes a `groupKey` from `animalType`, `gatheringPoint`, `groupType`, and optional `soloDeclarationId`. If `supervisorId` is empty, deletes the assignment; otherwise upserts. Revalidates `/head-supervisor`.

```ts
addSupervisor(_prev: ActionState, formData: FormData): Promise<ActionState>
```

Validates 12-digit civil ID and non-empty name; upserts the `Supervisor`. Revalidates `/head-supervisor`.

```ts
removeSupervisor(formData: FormData): Promise<void>
```

Deletes the supervisor by `id` (cascades to assignments). Revalidates `/head-supervisor`.

## 8. API endpoints

### `GET /api/resolve-location?u=<url-or-coords>`

Source: `src/app/api/resolve-location/route.ts`.

| Status | Body                              | Condition                                                  |
| ------ | --------------------------------- | ---------------------------------------------------------- |
| 200    | `{ lat: number, lng: number }`    | Coordinates parsed directly or after short-link expansion. |
| 400    | `{ error: "missing" }`            | Missing `u` query parameter.                               |
| 422    | `{ error: "unresolved" }`         | Could not extract coordinates.                             |

## 9. Library modules

### `GET /api/export/<macro>`

Downloads one CSV export (UTF-8 with BOM, CRLF). Macro names are listed under *Data import and export* below. 404 for an unknown name. The head-supervisor dashboard links to every macro.

### `src/lib/prisma.ts`

Exports a singleton `prisma` instance of `PrismaClient`. In non-production environments the instance is cached on `globalThis` to survive Next.js hot reload.

### `src/lib/identity.ts`

```ts
resolveIdentity(civilId: string): Promise<{ civilId, name } | null>
```

Trims input, requires 12 digits, queries the `Citizen` table. Returns `null` on miss. Marked in comments as the seam for a future PACI/Sahel SSO integration.

### `src/lib/phone.ts`

| Export                  | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `KUWAIT_MOBILE_RE`      | `/^[569]\d{7}$/`                                        |
| `normalizeKuwaitMobile` | Strips non-digits and an optional `965`/`00965` prefix. |
| `isValidKuwaitMobile`   | Returns whether the normalized form matches the regex.  |
| `KUWAIT_MOBILE_ERROR`   | Arabic error string for invalid mobile numbers.         |

### `src/lib/constants.ts`

Read-only label tables and helper functions:

- `GATHERING_POINTS`, `ANIMAL_TYPES`, `VIOLATION_STATUSES`, `DIFFERENCE_REASONS`: `Array<{ value, label }>` constants.
- `gatheringPointLabel`, `animalTypeLabel`, `violationStatusLabel`, `differenceReasonLabel`: lookup helpers that fall back to the raw value.
- `PROXIMITY_METERS = 5`: cross-farmer geographic proximity threshold.
- `PROXIMITY_SECONDS = 5`: chip-reading time-proximity threshold.
- `MIN_SITE_DISTANCE_METERS = 100`: minimum distance between two sites declared by the same farmer for the same animal type.

### `src/lib/geo.ts`

| Export             | Signature                                            | Description                                                                 |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `parseLatLng`      | `(input: string) => { lat, lng } \| null`            | Tries plain pairs, `@lat,lng`, `!3d!4d`, `/search\|place\|dir/lat,+lng`, and `?q\|query\|ll\|destination\|center\|daddr\|saddr=lat,lng`. Also tries a URL-decoded variant. Returns `null` for un-expanded short links. |
| `isShortLink`      | `(input: string) => boolean`                         | Matches `maps.app.goo.gl`, `goo.gl/maps`, `g.co/kgs`.           |
| `expandShortLink`  | `(url: string) => Promise<string \| null>`           | Fetches with `redirect: "follow"` and returns the final URL.                 |
| `distanceMeters`   | `(a: LatLng, b: LatLng) => number`                   | Haversine great-circle distance in meters (radius 6,371,000 m).                  |

### `src/lib/chips.ts`

```ts
processChipFile(content: string, startMs?: number, endMs?: number): ProcessResult
```

`ProcessResult` fields:

| Field                    | Type              | Description                                               |
| ------------------------ | ----------------- | --------------------------------------------------------- |
| `kept`                   | `ParsedReading[]` | Readings inside the window (or all, if no window given). |
| `parsedCount`            | `number`          | Total successfully parsed lines.                          |
| `discardedOutOfWindow`   | `number`          | Parsed but outside the window.                            |
| `invalidLines`           | `number[]`        | 1-indexed line numbers that failed format checks.         |
| `offendingChips`         | `string[]`        | Distinct `rawChip` values that triggered any flag.        |
| `hasSymbolFlag`          | `boolean`         | Any reading flagged for symbol/star.                      |
| `hasProximityFlag`       | `boolean`         | Any reading flagged for time-proximity.                   |

`ParsedReading` carries `ms` (UTC epoch), `rawChip`, `chipNumber` (alphanumeric only), `flaggedSymbol`, `flaggedProximity`, and 1-indexed `lineNo`.

Helpers:

- `windowInputMs(value: string)` — converts `YYYY-MM-DDTHH:mm[:ss]` to UTC milliseconds.
- Internal `chipDateTimeMs` — converts `DDMMYYYY` + `HHmmss` to UTC milliseconds with month/day/hour/minute/second range checks.

Flag rules:

- **Symbol flag**: set when `rawChip` matches `/[^0-9A-Za-z]/`.
- **Proximity flag**: set on both readings of any pair within `PROXIMITY_SECONDS * 1000` ms of each other after window filtering and ascending sort by `ms`.

### `src/lib/proximity.ts`

```ts
findProximityHits(declarationId: number): Promise<ProximityHit[]>
```

Loads the declaration's locations, fetches every `FarmLocation` not belonging to the declaration, and returns hits where `distanceMeters` ≤ `PROXIMITY_METERS`. Each hit includes the index of the offending self-location, the other declaration's id/name/civil ID, and both lat/lng pairs.

## 10. Component inventory

### `src/components/`

| File                  | Client |  Purpose                                                                                        |
| --------------------- | :----: | ----------------------------------------------------------------------------------------------- |
| `BrandLogo.tsx`       |   ✓    | Renders `/logo.png`; falls back to an inline SVG if the image fails to load.                    |
| `DatePicker.tsx`      |   ✓    | Custom DD-MM-YYYY calendar dropdown. Stores ISO `YYYY-MM-DD` in a hidden input.                 |
| `TimePicker.tsx`      |   ✓    | Custom hours/minutes/seconds column dropdown. Stores `HH:mm:ss` in a hidden input.              |
| `DeclarationView.tsx` |   —    | Read-only render of a declaration with all animal groups and locations.                         |
| `MapView.tsx`         |   ✓    | Leaflet map; imported dynamically because Leaflet touches `window`.                             |
| `PrintButton.tsx`     |   ✓    | Calls `window.print()`.                                                                         |
| `icons.tsx`           |   —    | Inline outline SVG icons: `IconClipboardEdit`, `IconClipboardCheck`, `IconCheckCircle`, `IconAlertTriangle`, `IconCalendar`, `IconClock`. |

### Page-scoped client components

| File                                            | Purpose                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `src/app/farmer/DeclarationForm.tsx`            | Multi-group / multi-location declaration form.                           |
| `src/app/supervisor/ScheduleRow.tsx`            | Clickable `<tr>` that navigates on row click.                            |
| `src/app/supervisor/MapLink.tsx`                | Renders a Google Maps deep link from lat/lng.                            |
| `src/app/supervisor/[id]/AuditForm.tsx`         | Audit form with chip file upload and live preview.                       |
| `src/app/supervisor/[id]/ChipFlagsTable.tsx`    | Per-reading flag toggles (`flaggedDoesntBelong`).                        |
| `src/app/head-supervisor/AssignControl.tsx`     | Dropdown to assign or unassign a group.                                  |
| `src/app/head-supervisor/SupervisorManager.tsx` | Add/remove supervisors.                                                  |

Forms use the canonical pattern:

```tsx
<form action={asyncFn} noValidate>
  ...
  <SubmitButton />  // reads `pending` via useFormStatus()
</form>
```

## 11. Business rules

### Identity

- Civil ID: exactly 12 digits. Trimmed, then matched against `^\d{12}$`. Used by `resolveIdentity`, supervisor login, and `addSupervisor`.

### Phone

- Kuwait mobile: 8 digits beginning with `5`, `6`, or `9`. Country code `965` / `00965` is stripped before validation. Landlines (leading `2`) are rejected.

### Farmer declaration

- At least one animal group; each group has at least one location.
- Each location requires a valid `gatheringPoint`, a parseable lat/lng, and integer counts ≥ 0 for `chippedCount`, `males`, `females`, `numTenders`.
- `males + females === chippedCount`.
- Editing an existing declaration writes a `DeclarationRevision` (snapshot of prior `mobile` and groups/locations as JSON) before the overwrite.

### Audit

- A site is only persisted if at least one of (location link, chip readings) is provided. If either is provided, both are required, plus a valid `violationStatus`.
- Multiple chip files for the same site are concatenated with `"\n"` before parsing.
- The chip file must contain at least one parsed in-window line; otherwise the action returns an Arabic error referencing the required format `DDMMYYYY,HHmmss ,رقم الشريحة`.
- `differenceReason_*` values are filtered against `DIFFERENCE_REASONS`.
- Coordinate resolution: `parseLatLng` is tried; for short links, `expandShortLink` is invoked first.
- Existing chip readings for a site are deleted before new ones are inserted.

### Chip-file processing

- Line format: `DDMMYYYY,HHmmss,<chip>` (additional commas are joined back into `rawChip`). Lines failing parse are recorded in `invalidLines`.
- Window filter: if both `startMs` and `endMs` are provided, only readings with `ms ∈ [startMs, endMs]` are kept.
- `flaggedSymbol`: `rawChip` contains a non-alphanumeric character.
- `flaggedProximity`: any pair with `Δms ≤ PROXIMITY_SECONDS * 1000` after sort by `ms`.
- `multipleChipsCount` (computed in `AuditPageContent`): number of runs of consecutive `flaggedSymbol` readings.

### Cross-farmer proximity

- Two farmers' locations within `PROXIMITY_METERS` (haversine) raise a hit. Surfaced as a warning on the audit page.

### Assignment

- Group key: `${animalType}_${gatheringPoint}_SMALL` or `${animalType}_${gatheringPoint}_SOLO_${declarationId}`.
- A SOLO group is created for any declaration whose total `chippedCount` at a gathering point exceeds `HEAD_THRESHOLD` (`750`). Remaining declarations form the SMALL bundle for that gathering point.
- Submitting an empty `supervisorId` deletes the assignment.

## 12. Build, test, and database commands

Scripts from `package.json`:

| Script              | Command                          | Purpose                                       |
| ------------------- | -------------------------------- | --------------------------------------------- |
| `npm run dev`       | `next dev`                       | Dev server with hot reload.                   |
| `npm run build`     | `prisma generate && next build`  | Production build.                             |
| `npm run start`     | `next start`                     | Run the production build.                     |
| `npm run start:local` | `node scripts/run-local.mjs`   | Docker-free launcher: set up DB on local PostgreSQL, build if stale, serve. |
| `npm run lint`      | `next lint`                      | Lint via Next.js ESLint config.               |
| `npm run db:push`   | `prisma db push`                 | Push `schema.prisma` to the database.         |
| `npm run db:seed`   | `tsx prisma/seed.ts`             | Insert demo citizens and supervisors.         |
| `npm run db:reset`  | `prisma migrate reset --force`   | Drop and recreate the schema; reseed.         |
| `npm run access`    | `tsx scripts/access.ts`          | Toggle farmer registration / updates.         |
| `npm run import:farmers` | `tsx scripts/import-farmers.ts` | Import a farmer CSV into `Citizen`.       |
| `npm run export`    | `tsx scripts/export.ts`          | Write CSV exports (see below).                |
| `npm run db:backfill-flags` | `tsx scripts/backfill-flags.ts` | Recompute `Declaration.lowHeadCount`.   |

### Feature switches (`npm run access`)

Two farmer-portal features can be switched at runtime, stored in the `FeatureAccess` table (no restart needed; with no row a feature is open to everyone):

- `registration` — first-time declarations
- `updates` — edits to an existing declaration

Each feature is either open to everyone, closed to everyone, or open only to listed civil IDs. Enforced in `submitDeclaration` (`src/app/farmer/actions.ts`) and shown as a notice on `/farmer`. Logic lives in `src/lib/access.ts`.

```
npm run access -- status
npm run access -- registration off
npm run access -- registration on
npm run access -- updates only 287010112345 290051509876   # replaces the allow-list
npm run access -- updates add 275112207654
npm run access -- updates remove 287010112345
```

### Data import and export

**Import farmers** — `npm run import:farmers -- <file.csv> [--dry-run] [--skip-invalid]`

Loads a farmer list into the `Citizen` table (the identity lookup, so imported farmers are also the only ones who can register). CSV columns: 12-digit civil ID and name; header row optional (without one the order is `civilId,name`); comma, semicolon or tab separated; Arabic-Indic digits are converted. Existing civil IDs are left unchanged. Any invalid row aborts the whole import unless `--skip-invalid` is passed. Imported farmers have no `Declaration` until they declare.

**Export** — `npm run export -- <macro|all|list> [--dir <folder>]` (default folder `./exports`, git-ignored), or the buttons on the head-supervisor dashboard (`/api/export/<macro>`). Both use `src/lib/exports.ts`, so they always match.

| Macro            | Rows                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `not-declared`   | Imported farmers (name + civil ID) with no declaration.                                       |
| `declared`       | Farmers with a declaration: contact, total heads per animal type, locations, low-head flag.   |
| `low-heads`      | Declarations with `lowHeadCount = true` (total declared heads < 50).                          |
| `fully-approved` | Every declared location has an audit result **and** the audit is approved by the head investigator. |
| `audit-data`     | One row per audited site (counts, violations, reasons, location, visit-failure reason, approval). A failed visit with no site data gets one row. |
| `audit-readings` | One row per chip reading with its flags (large).                                              |
| `all-farmers`    | Master list: every imported farmer with declaration / audit / approval status.                |

Text cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets do not run them as formulas. There is no authentication on any portal, including these downloads.

The `prisma.seed` field in `package.json` is set so `prisma migrate reset` runs the seed automatically.

There is no automated test suite. Type-checking is available via `npx tsc --noEmit`.

## 13. Styling and theming

### Tailwind

`tailwind.config.ts` registers a `gov` color palette:

| Token       | Hex       |
| ----------- | --------- |
| `gov`       | `#0a6b3c` |
| `gov-dark`  | `#075030` |
| `gov-light` | `#e6f2ec` |

`fontFamily.sans` is bound to `var(--font-arabic)` from the `next/font/google` Cairo loader in `src/app/layout.tsx`.

### Layout

`src/app/layout.tsx` sets `lang="ar"` and `dir="rtl"`, applies the Cairo font variable, and renders a header (with `BrandLogo` + authority name) and a footer (with the current year and authority name). Both header and footer carry `no-print` so they are hidden from print stylesheets.

### Global CSS

`src/app/globals.css` (referenced by `layout.tsx`) defines Tailwind layers and the custom utility classes used by components (`card`, `btn-primary`, `btn-secondary`, `field-label`, `field-input`, `danger-box`, `no-print`).

## 14. Static assets

| File                                  | Purpose                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `public/logo.png`                     | Authority logo loaded by `BrandLogo`.                     |
| `public/sample-chip-readings.txt`     | Nine demo chip-reading lines that exercise every rule (normal readings, proximity pairs, starred chips, out-of-window). |
