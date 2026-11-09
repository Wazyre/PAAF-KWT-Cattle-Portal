// Declaration logic for the API: validate a payload exactly as the farmer form does, tell a new declaration from an
// update, and save it the way the farmer portal's server action does (an update first stores the previous version in
// DeclarationRevision). The farmer portal's own action (src/app/farmer/actions.ts) is left as it was.
import { createHash } from "node:crypto";
import type { AnimalType, GatheringPoint } from "@/generated/prisma/enums";
import { prisma } from "../prisma";
import { resolveIdentity, type ResolvedIdentity } from "../identity";
import { isFeatureAllowed, REGISTRATION_CLOSED_ERROR, UPDATES_CLOSED_ERROR } from "../access";
import { isValidKuwaitMobile, normalizeKuwaitMobile, KUWAIT_MOBILE_ERROR } from "../phone";
import { ANIMAL_TYPES, GATHERING_POINTS, MIN_SITE_DISTANCE_METERS, animalTypeLabel } from "../constants";
import { distanceMeters, resolveLocation } from "../geo";
import { isLowHeadCount, totalHeads } from "../heads";
import {
  LEGAL_CONFIRMATION,
  LEGAL_HEADING,
  LEGAL_SECTIONS,
  LEGAL_VERSION
} from "../legal";
import { ApiFailure, type ApiIssue } from "./errors";
import type { ApiClientIdentity } from "./auth";

// ---------- limits (the farmer form has no hard caps; these only keep the database safe from absurd payloads) ----------

export const MAX_LOCATIONS_PER_ANIMAL_TYPE = 50;
export const MAX_COUNT = 10_000_000;
const MAX_LINK_LENGTH = 2048;

const GP = new Set<string>(GATHERING_POINTS.map((g) => g.value));
const AT = new Set<string>(ANIMAL_TYPES.map((a) => a.value));
const AT_ORDER = ANIMAL_TYPES.map((a) => a.value as string);

// ---------- shapes ----------

export interface LocationData {
  gatheringPoint: GatheringPoint;
  latitude: number;
  longitude: number;
  locationLink: string;
  chippedCount: number;
  males: number;
  females: number;
  numTenders: number;
}

export interface GroupData {
  animalType: AnimalType;
  locations: LocationData[];
}

export interface DeclarationData {
  mobile: string;
  mobile2: string | null;
  groups: GroupData[];
  /** The legal version the farmer accepted, if the request says they did. */
  legalVersion: string | null;
}

/** The stored declaration with its groups and locations. */
export interface DeclarationRow {
  id: number;
  civilId: string;
  name: string;
  mobile: string;
  mobile2: string | null;
  createdAt: Date;
  updatedAt: Date;
  animalGroups: Array<{
    animalType: AnimalType;
    locations: LocationData[];
  }>;
}

const DECLARATION_INCLUDE = {
  animalGroups: {
    orderBy: { id: "asc" },
    include: { locations: { orderBy: { id: "asc" } } }
  }
} as const;

export async function findDeclaration(civilId: string): Promise<DeclarationRow | null> {
  return prisma.declaration.findUnique({ where: { civilId }, include: DECLARATION_INCLUDE });
}

// ---------- reading ----------

/** The declaration as the API returns it (the groups always in the form's order: sheep and goats, camels, cows). */
export function toApiDeclaration(d: DeclarationRow) {
  const groups = [...d.animalGroups].sort((a, b) => AT_ORDER.indexOf(a.animalType) - AT_ORDER.indexOf(b.animalType));
  return {
    transactionId: d.id,
    civilId: d.civilId,
    name: d.name,
    mobile: d.mobile,
    mobile2: d.mobile2,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    animalGroups: groups.map((g) => ({
      animalType: g.animalType,
      locations: g.locations.map((l) => ({
        gatheringPoint: l.gatheringPoint,
        locationLink: l.locationLink,
        latitude: l.latitude,
        longitude: l.longitude,
        chippedCount: l.chippedCount,
        males: l.males,
        females: l.females,
        numTenders: l.numTenders
      }))
    }))
  };
}

/** Strong ETag of the stored declaration; changes on every update. Used with If-Match / If-None-Match. */
export function etagOf(d: { id: number; updatedAt: Date }): string {
  return `"${d.id}-${d.updatedAt.getTime()}"`;
}

/** The person behind a civil ID, or a 404 if they are not on the farmer list. */
export async function requireFarmer(civilId: string): Promise<ResolvedIdentity> {
  const identity = await resolveIdentity(civilId);
  if (!identity) {
    throw new ApiFailure(
      404,
      "NOT_REGISTERED",
      "This civil ID is not on the farmer list, so it cannot declare.",
      "تعذّر التحقق من الهوية. الرقم المدني غير صالح."
    );
  }
  return identity;
}

export type DeclarationMode = "NEW" | "UPDATE";

export interface FarmerStatus {
  mode: DeclarationMode;
  allowed: boolean;
  blockedReason: "REGISTRATION_CLOSED" | "UPDATES_CLOSED" | null;
  declaration: DeclarationRow | null;
}

/** New or update, and whether the registration / update switches (`npm run access`) currently let this farmer submit. */
export async function farmerStatus(civilId: string): Promise<FarmerStatus> {
  const declaration = await findDeclaration(civilId);
  const mode: DeclarationMode = declaration ? "UPDATE" : "NEW";
  const allowed = await isFeatureAllowed(declaration ? "UPDATES" : "REGISTRATION", civilId);
  return {
    mode,
    allowed,
    blockedReason: allowed ? null : declaration ? "UPDATES_CLOSED" : "REGISTRATION_CLOSED",
    declaration
  };
}

/** Throws the 403 the portal shows when the switches are closed for this farmer. */
export function assertOpen(status: FarmerStatus): void {
  if (status.allowed) return;
  if (status.mode === "UPDATE") {
    throw new ApiFailure(403, "UPDATES_CLOSED", "Editing declarations is closed for this civil ID.", UPDATES_CLOSED_ERROR);
  }
  throw new ApiFailure(403, "REGISTRATION_CLOSED", "New registrations are closed for this civil ID.", REGISTRATION_CLOSED_ERROR);
}

// ---------- legal text ----------

export function legalTextHash(): string {
  const text = [LEGAL_HEADING, ...LEGAL_SECTIONS.flatMap((s) => [s.title, ...s.paragraphs]), LEGAL_CONFIRMATION].join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The most recent acceptance on record for this civil ID, if any. */
export function latestAcceptance(civilId: string) {
  return prisma.legalAcceptance.findFirst({ where: { civilId }, orderBy: { acceptedAt: "desc" } });
}

/** A first declaration must carry the acceptance; any acceptance that is sent must be of the current text. */
export function checkLegal(mode: DeclarationMode, legalVersion: string | null): void {
  if (mode === "NEW" && legalVersion === null) {
    throw new ApiFailure(
      422,
      "LEGAL_ACCEPTANCE_REQUIRED",
      `A first declaration needs "legal": { "accepted": true, "version": "${LEGAL_VERSION}" }. Show the text from GET /legal and ask the farmer to confirm it.`,
      "يجب الموافقة على الإقرار والتعهد قبل إرسال الإقرار."
    );
  }
  if (legalVersion !== null && legalVersion !== LEGAL_VERSION) {
    throw new ApiFailure(
      409,
      "LEGAL_VERSION_MISMATCH",
      `The legal text was updated (current version "${LEGAL_VERSION}", you sent "${legalVersion}"). Fetch GET /legal again and ask the farmer to confirm the new text.`,
      "تم تحديث نص الإقرار والتعهد. يرجى قراءته والموافقة عليه من جديد."
    );
  }
}

// ---------- validation ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function integerIn(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT ? v : null;
}

const UNRESOLVED_LOCATION = "تعذّر استخراج الإحداثيات من الرابط. تأكّد من الرابط أو أدخل الإحداثيات بصيغة 29.1234, 47.9876";

/**
 * Checks a request body against the farmer form's rules and returns it normalised, or throws a 422 listing every
 * problem with the path of the field. Coordinates are read from `latitude`/`longitude` when sent, otherwise worked out
 * from `locationLink` (a pasted "lat, lng" or a Google Maps link) on the server.
 */
export async function parseDeclaration(body: unknown): Promise<DeclarationData> {
  if (!isRecord(body)) throw new ApiFailure(400, "INVALID_BODY", "The request body must be a JSON object.");

  const issues: ApiIssue[] = [];
  const bad = (path: string, code: string, message: string) => issues.push({ path, code, message });

  // phone numbers
  let mobile = "";
  if (typeof body.mobile !== "string" || !body.mobile.trim()) {
    bad("mobile", "MOBILE_REQUIRED", "يرجى إدخال رقم الهاتف الشخصي.");
  } else if (!isValidKuwaitMobile(body.mobile)) {
    bad("mobile", "INVALID_MOBILE", KUWAIT_MOBILE_ERROR);
  } else {
    mobile = normalizeKuwaitMobile(body.mobile);
  }
  let mobile2: string | null = null;
  if (body.mobile2 !== undefined && body.mobile2 !== null && body.mobile2 !== "") {
    if (typeof body.mobile2 !== "string" || !isValidKuwaitMobile(body.mobile2)) {
      bad("mobile2", "INVALID_MOBILE", KUWAIT_MOBILE_ERROR);
    } else {
      mobile2 = normalizeKuwaitMobile(body.mobile2);
    }
  }

  // acceptance of the legal text
  let legalVersion: string | null = null;
  if (body.legal !== undefined && body.legal !== null) {
    const legal = body.legal;
    if (!isRecord(legal) || legal.accepted !== true || typeof legal.version !== "string" || !legal.version.trim()) {
      bad("legal", "LEGAL_ACCEPTANCE_REQUIRED", "يجب الموافقة على الإقرار والتعهد.");
    } else {
      legalVersion = legal.version.trim();
    }
  }

  // animal groups
  const groups: GroupData[] = [];
  const pendingCoordinates: Array<{ at: string; target: LocationData; link: string }> = [];
  const rawGroups = body.animalGroups;
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) {
    bad("animalGroups", "ANIMAL_GROUPS_REQUIRED", "يجب إضافة نوع حيوان واحد على الأقل.");
  } else {
    const seen = new Set<string>();
    rawGroups.forEach((rawGroup, i) => {
      const gPath = `animalGroups[${i}]`;
      const gLabel = `النوع ${i + 1}`;
      if (!isRecord(rawGroup)) return bad(gPath, "INVALID_ANIMAL_TYPE", `${gLabel}: يجب اختيار نوع الحيوان.`);
      const animalType = String(rawGroup.animalType ?? "");
      if (!AT.has(animalType)) {
        bad(`${gPath}.animalType`, "INVALID_ANIMAL_TYPE", `${gLabel}: يجب اختيار نوع الحيوان.`);
      } else if (seen.has(animalType)) {
        bad(`${gPath}.animalType`, "DUPLICATE_ANIMAL_TYPE", `${gLabel}: نوع الحيوان مكرر. ضع جميع مواقع النوع الواحد في مجموعة واحدة.`);
      }
      seen.add(animalType);

      const rawLocations = Array.isArray(rawGroup.locations) ? rawGroup.locations : [];
      if (rawLocations.length === 0) {
        return bad(`${gPath}.locations`, "LOCATIONS_REQUIRED", `${gLabel}: يجب إضافة موقع واحد على الأقل.`);
      }
      if (rawLocations.length > MAX_LOCATIONS_PER_ANIMAL_TYPE) {
        return bad(`${gPath}.locations`, "TOO_MANY_LOCATIONS", `${gLabel}: عدد المواقع يتجاوز الحد المسموح (${MAX_LOCATIONS_PER_ANIMAL_TYPE}).`);
      }

      const locations: LocationData[] = [];
      rawLocations.forEach((rawLocation, j) => {
        const lPath = `${gPath}.locations[${j}]`;
        const lLabel = `${gLabel} / الموقع ${j + 1}`;
        if (!isRecord(rawLocation)) return bad(lPath, "INVALID_LOCATION", `${lLabel}: بيانات الموقع غير صحيحة.`);

        const gatheringPoint = String(rawLocation.gatheringPoint ?? "");
        if (!GP.has(gatheringPoint)) bad(`${lPath}.gatheringPoint`, "INVALID_GATHERING_POINT", `${lLabel}: يجب اختيار نقطة التجمّع.`);

        const link = typeof rawLocation.locationLink === "string" ? rawLocation.locationLink.trim() : "";
        if (!link || link.length > MAX_LINK_LENGTH) {
          bad(`${lPath}.locationLink`, "LOCATION_LINK_REQUIRED", `${lLabel}: يجب تحديد الموقع الجغرافي (الصق رابط الموقع لتحديد إحداثياته).`);
        }

        const chipped = integerIn(rawLocation.chippedCount);
        const males = integerIn(rawLocation.males);
        const hasFemales = rawLocation.females !== undefined && rawLocation.females !== null;
        const femalesGiven = hasFemales ? integerIn(rawLocation.females) : 0;
        if (chipped === null) bad(`${lPath}.chippedCount`, "INVALID_COUNT", `${lLabel}: الأعداد المدخلة غير صحيحة.`);
        if (males === null) bad(`${lPath}.males`, "INVALID_COUNT", `${lLabel}: الأعداد المدخلة غير صحيحة.`);
        if (femalesGiven === null) bad(`${lPath}.females`, "INVALID_COUNT", `${lLabel}: الأعداد المدخلة غير صحيحة.`);
        let females = 0;
        if (chipped !== null && males !== null && femalesGiven !== null) {
          females = hasFemales ? femalesGiven : chipped - males;
          if (females < 0 || males + females !== chipped) {
            bad(`${lPath}.${hasFemales ? "females" : "males"}`, "COUNT_MISMATCH", `${lLabel}: مجموع الذكور والإناث يجب أن يساوي عدد الحيوانات المُرقّمة.`);
          }
        }
        const numTenders = integerIn(rawLocation.numTenders);
        if (numTenders === null) bad(`${lPath}.numTenders`, "INVALID_COUNT", `${lLabel}: عدد العمال/الرعاة غير صحيح.`);

        // coordinates: both or neither
        const lat = rawLocation.latitude;
        const lng = rawLocation.longitude;
        const sent = (lat !== undefined && lat !== null) || (lng !== undefined && lng !== null);
        let latitude = 0;
        let longitude = 0;
        let resolveFromLink = false;
        if (sent) {
          if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            bad(`${lPath}.latitude`, "INVALID_COORDINATES", `${lLabel}: الإحداثيات غير صحيحة.`);
          } else {
            latitude = lat;
            longitude = lng;
          }
        } else {
          resolveFromLink = true;
        }

        const location: LocationData = {
          gatheringPoint: gatheringPoint as GatheringPoint,
          latitude,
          longitude,
          locationLink: link,
          chippedCount: chipped ?? 0,
          males: males ?? 0,
          females,
          numTenders: numTenders ?? 0
        };
        locations.push(location);
        if (resolveFromLink && link && link.length <= MAX_LINK_LENGTH) pendingCoordinates.push({ at: lPath, target: location, link });
      });
      groups.push({ animalType: animalType as AnimalType, locations });
    });
  }

  // Only now spend time on the network: look up the coordinates of links that came without them.
  if (issues.length === 0 && pendingCoordinates.length > 0) {
    await Promise.all(
      pendingCoordinates.map(async ({ at, target, link }) => {
        const found = await resolveLocation(link);
        if (found) {
          target.latitude = found.lat;
          target.longitude = found.lng;
        } else {
          bad(`${at}.locationLink`, "LOCATION_UNRESOLVED", UNRESOLVED_LOCATION);
        }
      })
    );
  }

  // Two sites of the same animal type must be at least MIN_SITE_DISTANCE_METERS apart (the form enforces it in the browser).
  if (issues.length === 0) {
    groups.forEach((g, gi) => {
      for (let i = 0; i < g.locations.length; i++) {
        for (let j = i + 1; j < g.locations.length; j++) {
          const a = g.locations[i];
          const b = g.locations[j];
          const d = distanceMeters({ lat: a.latitude, lng: a.longitude }, { lat: b.latitude, lng: b.longitude });
          if (d < MIN_SITE_DISTANCE_METERS) {
            const message = `${animalTypeLabel(g.animalType)}: الموقع ${i + 1} والموقع ${j + 1} قريبان جداً (${d.toFixed(0)} م). يجب أن تبعد المواقع عن بعضها ${MIN_SITE_DISTANCE_METERS} متراً على الأقل.`;
            bad(`animalGroups[${gi}].locations[${i}].locationLink`, "LOCATIONS_TOO_CLOSE", message);
            bad(`animalGroups[${gi}].locations[${j}].locationLink`, "LOCATIONS_TOO_CLOSE", message);
          }
        }
      }
    });
  }

  if (issues.length > 0) {
    throw new ApiFailure(422, "VALIDATION_FAILED", `${issues.length} problem${issues.length === 1 ? "" : "s"} in the declaration; see details.`, issues[0].message, issues);
  }

  groups.sort((a, b) => AT_ORDER.indexOf(a.animalType) - AT_ORDER.indexOf(b.animalType));
  return { mobile, mobile2, groups, legalVersion };
}

// ---------- saving ----------

export type SaveKind = "CREATED" | "UPDATED" | "UNCHANGED";

/** The parts of a declaration that count as its content, in a fixed order, for telling whether anything changed. */
function contentKey(d: { mobile: string; mobile2: string | null; groups: GroupData[] }): string {
  return JSON.stringify([
    d.mobile,
    d.mobile2,
    d.groups.map((g) => [
      g.animalType,
      g.locations.map((l) => [l.gatheringPoint, l.latitude, l.longitude, l.locationLink, l.chippedCount, l.males, l.females, l.numTenders])
    ])
  ]);
}

function rowGroups(d: DeclarationRow): GroupData[] {
  return [...d.animalGroups]
    .sort((a, b) => AT_ORDER.indexOf(a.animalType) - AT_ORDER.indexOf(b.animalType))
    .map((g) => ({ animalType: g.animalType, locations: g.locations }));
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

const stripEtag = (v: string) => v.trim().replace(/^W\//, "");

export interface SaveArgs {
  identity: ResolvedIdentity;
  data: DeclarationData;
  client: ApiClientIdentity;
  /** New or update, as seen when the request started (what the legal check was made against). */
  mode: DeclarationMode;
  /** If-Match header: only update when the stored declaration still has this ETag ("*" = it must exist). */
  ifMatch: string | null;
  /** If-None-Match header: "*" = only create, fail when a declaration already exists. */
  ifNoneMatch: string | null;
}

/**
 * Creates the declaration, or replaces the existing one after storing its previous version in DeclarationRevision.
 * Everything happens in one transaction with the farmer's row locked, so two simultaneous submissions queue up and a
 * failure half way leaves the old declaration untouched. Sending exactly what is already stored changes nothing.
 */
export async function saveDeclaration(args: SaveArgs): Promise<{ kind: SaveKind; declaration: DeclarationRow }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await saveOnce(args);
    } catch (e) {
      // Two first-time submissions raced: the other one won, so this one is now an update. Run again.
      if (isUniqueViolation(e) && attempt === 0) continue;
      throw e;
    }
  }
}

async function saveOnce({ identity, data, client, mode, ifMatch, ifNoneMatch }: SaveArgs): Promise<{ kind: SaveKind; declaration: DeclarationRow }> {
  const { civilId } = identity;
  const lowHeadCount = isLowHeadCount(totalHeads(data.groups));
  const groupsCreate = data.groups.map((g) => ({ animalType: g.animalType, locations: { create: g.locations } }));

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Declaration" WHERE "civilId" = ${civilId} FOR UPDATE`;
    const existing = await tx.declaration.findUnique({ where: { civilId }, include: DECLARATION_INCLUDE });

    // The declaration was removed while this request was running: the legal check above was made for an update.
    if (!existing && mode === "UPDATE") {
      throw new ApiFailure(409, "CONFLICT", "The declaration was removed while this request was running. Load the status again.", "تعذّر حفظ الإقرار. يرجى إعادة المحاولة.");
    }
    if (ifNoneMatch !== null && stripEtag(ifNoneMatch) === "*" && existing) {
      throw new ApiFailure(412, "PRECONDITION_FAILED", "A declaration already exists for this civil ID (If-None-Match: * asked for a first submission only).", "يوجد إقرار مسجّل مسبقاً لهذا الرقم المدني.");
    }
    if (ifMatch !== null) {
      const wanted = stripEtag(ifMatch);
      if (!existing || (wanted !== "*" && wanted !== etagOf(existing))) {
        throw new ApiFailure(412, "PRECONDITION_FAILED", "The declaration changed since it was loaded (If-Match does not match its current ETag). Load it again.", "تم تعديل الإقرار منذ تحميله. يرجى إعادة تحميله.");
      }
    }

    let kind: SaveKind;
    let id: number;
    if (!existing) {
      const created = await tx.declaration.create({
        data: { civilId, name: identity.name, mobile: data.mobile, mobile2: data.mobile2, lowHeadCount, animalGroups: { create: groupsCreate } }
      });
      kind = "CREATED";
      id = created.id;
    } else if (contentKey(data) === contentKey({ mobile: existing.mobile, mobile2: existing.mobile2, groups: rowGroups(existing) })) {
      kind = "UNCHANGED";
      id = existing.id;
    } else {
      await tx.declarationRevision.create({
        data: {
          declarationId: existing.id,
          mobile: existing.mobile,
          locations: existing.animalGroups.map((g) => ({
            animalType: g.animalType,
            locations: g.locations.map((l) => ({
              gatheringPoint: l.gatheringPoint,
              latitude: l.latitude,
              longitude: l.longitude,
              locationLink: l.locationLink,
              chippedCount: l.chippedCount,
              males: l.males,
              females: l.females,
              numTenders: l.numTenders
            }))
          }))
        }
      });
      await tx.animalGroup.deleteMany({ where: { declarationId: existing.id } });
      await tx.declaration.update({
        where: { id: existing.id },
        data: { mobile: data.mobile, mobile2: data.mobile2, lowHeadCount, animalGroups: { create: groupsCreate } }
      });
      kind = "UPDATED";
      id = existing.id;
    }

    // Keep the proof of acceptance (once per version).
    if (data.legalVersion !== null) {
      const already = await tx.legalAcceptance.findFirst({ where: { civilId, version: data.legalVersion } });
      if (!already) {
        await tx.legalAcceptance.create({ data: { civilId, version: data.legalVersion, textHash: legalTextHash(), source: client.name } });
      }
    }

    const declaration = await tx.declaration.findUniqueOrThrow({ where: { id }, include: DECLARATION_INCLUDE });
    return { kind, declaration };
  });

  console.log(`[api] ${client.name}: declaration ${result.kind.toLowerCase()} for civil ID ending …${civilId.slice(-4)} (transaction ${result.declaration.id}).`);
  return result;
}
