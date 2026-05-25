"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ViolationStatus, AnimalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processChipFile } from "@/lib/chips";
import { parseLatLng, isShortLink, expandShortLink } from "@/lib/geo";
import {
  VIOLATION_STATUSES,
  DIFFERENCE_REASONS,
  animalTypeLabel
} from "@/lib/constants";

export interface AuditState {
  error?: string;
}

const VS = new Set<string>(VIOLATION_STATUSES.map((v) => v.value));
const DR = new Set<string>(DIFFERENCE_REASONS.map((d) => d.value));

async function resolveLocation(
  link: string
): Promise<{ lat: number; lng: number } | null> {
  let expanded = link;
  if (isShortLink(link)) {
    expanded = (await expandShortLink(link)) ?? link;
  }
  const coords = parseLatLng(expanded);
  return coords ?? null;
}

export async function submitAudit(
  _prev: AuditState,
  formData: FormData
): Promise<AuditState> {
  const declarationId = Number(formData.get("declarationId"));
  if (!Number.isInteger(declarationId)) {
    return { error: "رقم المعاملة غير صالح." };
  }

  const decl = await prisma.declaration.findUnique({
    where: { id: declarationId },
    include: { animalGroups: true }
  });
  if (!decl) return { error: "المعاملة غير موجودة." };

  const rawTypesToProcess = String(
    formData.get("animalTypesToProcess") ?? ""
  );
  let parsedTypes: string[] = [];
  try {
    parsedTypes = JSON.parse(rawTypesToProcess);
    if (!Array.isArray(parsedTypes)) parsedTypes = [];
  } catch {
    parsedTypes = [];
  }

  const allDeclaredTypes = new Set(decl.animalGroups.map((g) => g.animalType));
  const animalTypes = (
    parsedTypes.length > 0
      ? parsedTypes.filter((t) => allDeclaredTypes.has(t as AnimalType))
      : [...allDeclaredTypes]
  ) as AnimalType[];

  if (animalTypes.length === 0) {
    return { error: "لم يتم تحديد أنواع الحيوانات المراد معالجتها." };
  }

  // Check existing audit to determine if chip files are optional for each type.
  const existingAudit = await prisma.audit.findUnique({
    where: { declarationId },
    include: {
      animalResults: {
        include: { _count: { select: { readings: true } } }
      }
    }
  });

  // Validate and collect per-type data before touching the DB.
  type TypePayload = {
    animalType: AnimalType;
    violationStatus: ViolationStatus;
    differenceReasons: string[];
    locationLink: string;
    lat: number | null;
    lng: number | null;
    chipContent: string | null; // null = keep existing readings
  };

  const payloads: TypePayload[] = [];

  for (const type of animalTypes) {
    const label = animalTypeLabel(type);

    const locationLink = String(
      formData.get(`locationLink_${type}`) ?? ""
    ).trim();
    if (!locationLink) {
      return { error: `يرجى إدخال الموقع الجغرافي لقراءة شرائح ${label}.` };
    }

    const vs = String(formData.get(`violationStatus_${type}`) ?? "");
    if (!VS.has(vs)) {
      return { error: `يرجى تحديد حالة المخالفة لـ${label}.` };
    }

    const reasons = formData
      .getAll(`differenceReason_${type}`)
      .map((r) => String(r))
      .filter((r) => DR.has(r));

    const file = formData.get(`chipFile_${type}`);
    const hasFile = file instanceof File && file.size > 0;
    const existingResult = existingAudit?.animalResults.find(
      (r) => r.animalType === type
    );
    const hasExistingReadings = (existingResult?._count.readings ?? 0) > 0;

    if (!hasFile && !hasExistingReadings) {
      return { error: `يرجى رفع ملف قراءات الشرائح لـ${label}.` };
    }

    let chipContent: string | null = null;
    if (hasFile) {
      try {
        chipContent = await (file as File).text();
      } catch {
        return {
          error: `تعذّرت قراءة ملف الشرائح لـ${label}. تأكّد من أنه ملف نصي صالح.`
        };
      }
    }

    const coords = await resolveLocation(locationLink);
    if (!coords) {
      return {
        error: `تعذّر استخراج الإحداثيات من موقع ${label}. أدخل إحداثيات مباشرة (مثال: 29.1234, 47.9876) أو رابط خرائط صالح.`
      };
    }

    payloads.push({
      animalType: type,
      violationStatus: vs as ViolationStatus,
      differenceReasons: reasons,
      locationLink,
      lat: coords.lat,
      lng: coords.lng,
      chipContent
    });
  }

  // Validate chip file contents before touching the DB.
  const FORMAT_HINT = "الصيغة المطلوبة لكل سطر: DDMMYYYY,HHmmss ,رقم الشريحة";
  const processedFiles: Map<AnimalType, ReturnType<typeof processChipFile>> =
    new Map();

  for (const p of payloads) {
    if (p.chipContent === null) continue;
    const result = processChipFile(p.chipContent);
    const label = animalTypeLabel(p.animalType);

    if (result.parsedCount === 0) {
      return {
        error: `ملف ${label} لا يحتوي على أي قراءة بالصيغة المطلوبة. ${FORMAT_HINT}`
      };
    }
    if (result.invalidLines.length > 0) {
      const shown = result.invalidLines.slice(0, 10).join("، ");
      const more =
        result.invalidLines.length > 10
          ? ` (و${result.invalidLines.length - 10} أسطر أخرى)`
          : "";
      return {
        error: `ملف ${label} يحتوي على أسطر بصيغة غير صحيحة: الأسطر ${shown}${more}. ${FORMAT_HINT}`
      };
    }
    if (result.kept.length === 0) {
      return {
        error: `ملف ${label} لا يحتوي على قراءات صالحة.`
      };
    }
    processedFiles.set(p.animalType, result);
  }

  // Upsert audit + per-type results inside a transaction.
  await prisma.$transaction(async (tx) => {
    const audit = await tx.audit.upsert({
      where: { declarationId },
      update: {},
      create: { declarationId }
    });

    for (const p of payloads) {
      const result = await tx.auditAnimalResult.upsert({
        where: {
          auditId_animalType: { auditId: audit.id, animalType: p.animalType }
        },
        update: {
          violationStatus: p.violationStatus,
          differenceReasons: p.differenceReasons,
          locationLink: p.locationLink,
          latitude: p.lat,
          longitude: p.lng
        },
        create: {
          auditId: audit.id,
          animalType: p.animalType,
          violationStatus: p.violationStatus,
          differenceReasons: p.differenceReasons,
          locationLink: p.locationLink,
          latitude: p.lat,
          longitude: p.lng
        }
      });

      const chipResult = processedFiles.get(p.animalType);
      if (chipResult) {
        await tx.chipReading.deleteMany({
          where: { animalResultId: result.id }
        });
        await tx.chipReading.createMany({
          data: chipResult.kept.map((r) => ({
            animalResultId: result.id,
            readAt: new Date(r.ms),
            chipNumber: r.chipNumber,
            rawChip: r.rawChip,
            flaggedSymbol: r.flaggedSymbol,
            flaggedProximity: r.flaggedProximity
          }))
        });
      }
    }
  });

  revalidatePath(`/supervisor/${declarationId}`);
  const animalTypeFilter = String(formData.get("animalTypeFilter") ?? "").trim();
  const redirectUrl = animalTypeFilter
    ? `/supervisor/${declarationId}?saved=1&animalType=${encodeURIComponent(animalTypeFilter)}`
    : `/supervisor/${declarationId}?saved=1`;
  redirect(redirectUrl);
}
