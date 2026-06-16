"use server";
// Server action that creates or revises a farmer declaration (stores prior version in DeclarationRevision).

import { redirect } from "next/navigation";
import type { GatheringPoint, AnimalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveIdentity } from "@/lib/identity";
import { isValidKuwaitMobile, KUWAIT_MOBILE_ERROR } from "@/lib/phone";
import { GATHERING_POINTS, ANIMAL_TYPES } from "@/lib/constants";

export interface DeclarationState {
  error?: string;
}

const GP = new Set<string>(GATHERING_POINTS.map((g) => g.value));
const AT = new Set<string>(ANIMAL_TYPES.map((a) => a.value));

// Parse a value as a non-negative integer; return null if it isn't one.
function intOrNull(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Validates the form payload, then creates a new declaration or stores the previous version in DeclarationRevision and updates the existing one.
export async function submitDeclaration(
  _prev: DeclarationState,
  formData: FormData
): Promise<DeclarationState> {
  const civilId = String(formData.get("civilId") ?? "").trim();
  const mobile = String(formData.get("mobile") ?? "").trim();
  const payloadRaw = String(formData.get("payload") ?? "");

  const identity = await resolveIdentity(civilId);
  if (!identity) {
    return { error: "تعذّر التحقق من الهوية. الرقم المدني غير صالح." };
  }
  if (!isValidKuwaitMobile(mobile)) {
    return { error: KUWAIT_MOBILE_ERROR };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadRaw);
  } catch {
    return { error: "تعذّرت قراءة بيانات الإقرار." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "يجب إضافة نوع حيوان واحد على الأقل." };
  }

  type GroupPayload = {
    animalType: AnimalType;
    locations: Array<{
      gatheringPoint: GatheringPoint;
      latitude: number;
      longitude: number;
      locationLink: string;
      chippedCount: number;
      males: number;
      females: number;
      numTenders: number;
    }>;
  };

  const groups: GroupPayload[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const g = parsed[i] as Record<string, unknown>;
    const at = String(g.animalType ?? "");
    if (!AT.has(at)) {
      return { error: `النوع ${i + 1}: يجب اختيار نوع الحيوان.` };
    }

    const rawLocs = Array.isArray(g.locations) ? g.locations : [];
    if (rawLocs.length === 0) {
      return { error: `النوع ${i + 1}: يجب إضافة موقع واحد على الأقل.` };
    }

    const locations = [];
    for (let j = 0; j < rawLocs.length; j++) {
      const loc = rawLocs[j] as Record<string, unknown>;
      const gp = String(loc.gatheringPoint ?? "");
      if (!GP.has(gp)) {
        return {
          error: `النوع ${i + 1} / الموقع ${j + 1}: يجب اختيار نقطة التجمّع.`
        };
      }
      const lat = typeof loc.lat === "number" ? loc.lat : null;
      const lng = typeof loc.lng === "number" ? loc.lng : null;
      if (lat === null || lng === null) {
        return {
          error: `النوع ${i + 1} / الموقع ${j + 1}: يجب تحديد الموقع الجغرافي بدقة (اضغط "رفع الموقع").`
        };
      }
      const chipped = intOrNull(loc.chippedCount);
      const males = intOrNull(loc.males);
      const females = intOrNull(loc.females);
      const numTenders = intOrNull(loc.numTenders);
      if (chipped === null || males === null || females === null) {
        return {
          error: `النوع ${i + 1} / الموقع ${j + 1}: الأعداد المدخلة غير صحيحة.`
        };
      }
      if (males + females !== chipped) {
        return {
          error: `النوع ${i + 1} / الموقع ${j + 1}: مجموع الذكور والإناث يجب أن يساوي عدد الحيوانات المُرقّمة.`
        };
      }
      if (numTenders === null) {
        return {
          error: `النوع ${i + 1} / الموقع ${j + 1}: عدد العمال/الرعاة غير صحيح.`
        };
      }
      locations.push({
        gatheringPoint: gp as GatheringPoint,
        latitude: lat,
        longitude: lng,
        locationLink: String(loc.locationLink ?? ""),
        chippedCount: chipped,
        males,
        females,
        numTenders
      });
    }

    groups.push({ animalType: at as AnimalType, locations });
  }

  const existing = await prisma.declaration.findUnique({
    where: { civilId: identity.civilId },
    include: { animalGroups: { include: { locations: true } } }
  });

  if (existing) {
    await prisma.declarationRevision.create({
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

    await prisma.animalGroup.deleteMany({ where: { declarationId: existing.id } });

    await prisma.declaration.update({
      where: { id: existing.id },
      data: {
        mobile,
        animalGroups: {
          create: groups.map((g) => ({
            animalType: g.animalType,
            locations: { create: g.locations }
          }))
        }
      }
    });

    redirect(`/farmer/success/${existing.id}?updated=1`);
  } else {
    const declaration = await prisma.declaration.create({
      data: {
        civilId: identity.civilId,
        name: identity.name,
        mobile,
        animalGroups: {
          create: groups.map((g) => ({
            animalType: g.animalType,
            locations: { create: g.locations }
          }))
        }
      }
    });

    redirect(`/farmer/success/${declaration.id}`);
  }
}
