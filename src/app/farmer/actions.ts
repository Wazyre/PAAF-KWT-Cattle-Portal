"use server";

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

function intOrNull(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

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
    return { error: "تعذّرت قراءة بيانات المواقع." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "يجب إضافة موقع واحد على الأقل." };
  }

  const locations: {
    gatheringPoint: GatheringPoint;
    numTenders: number;
    latitude: number;
    longitude: number;
    locationLink: string;
    animals: {
      animalType: AnimalType;
      chippedCount: number;
      males: number;
      females: number;
    }[];
  }[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const loc = parsed[i] as Record<string, unknown>;
    const gp = String(loc.gatheringPoint ?? "");
    if (!GP.has(gp)) {
      return { error: `الموقع ${i + 1}: يجب اختيار نقطة التجمّع.` };
    }
    const numTenders = intOrNull(loc.numTenders);
    if (numTenders === null) {
      return { error: `الموقع ${i + 1}: عدد العمال/الرعاة غير صحيح.` };
    }
    const lat = typeof loc.lat === "number" ? loc.lat : null;
    const lng = typeof loc.lng === "number" ? loc.lng : null;
    if (lat === null || lng === null) {
      return {
        error: `الموقع ${i + 1}: يجب تحديد الموقع الجغرافي بدقة (اضغط "عرض الموقع").`
      };
    }
    const rawAnimals = Array.isArray(loc.animals) ? loc.animals : [];
    if (rawAnimals.length === 0) {
      return { error: `الموقع ${i + 1}: يجب إضافة نوع حيوان واحد على الأقل.` };
    }
    const animals = [];
    for (let j = 0; j < rawAnimals.length; j++) {
      const a = rawAnimals[j] as Record<string, unknown>;
      const at = String(a.animalType ?? "");
      const chipped = intOrNull(a.chippedCount);
      const males = intOrNull(a.males);
      const females = intOrNull(a.females);
      if (!AT.has(at)) {
        return {
          error: `الموقع ${i + 1} / النوع ${j + 1}: يجب اختيار نوع الحيوان.`
        };
      }
      if (chipped === null || males === null || females === null) {
        return {
          error: `الموقع ${i + 1} / النوع ${j + 1}: الأعداد المدخلة غير صحيحة.`
        };
      }
      if (males + females !== chipped) {
        return {
          error: `الموقع ${i + 1} / النوع ${j + 1}: مجموع الذكور والإناث يجب أن يساوي عدد الحيوانات المُرقّمة.`
        };
      }
      animals.push({
        animalType: at as AnimalType,
        chippedCount: chipped,
        males,
        females
      });
    }
    locations.push({
      gatheringPoint: gp as GatheringPoint,
      numTenders,
      latitude: lat,
      longitude: lng,
      locationLink: String(loc.locationLink ?? ""),
      animals
    });
  }

  const declaration = await prisma.declaration.create({
    data: {
      civilId: identity.civilId,
      name: identity.name,
      mobile,
      locations: {
        create: locations.map((l) => ({
          gatheringPoint: l.gatheringPoint,
          numTenders: l.numTenders,
          latitude: l.latitude,
          longitude: l.longitude,
          locationLink: l.locationLink,
          animals: { create: l.animals }
        }))
      }
    }
  });

  redirect(`/farmer/success/${declaration.id}`);
}
