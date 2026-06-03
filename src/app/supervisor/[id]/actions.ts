"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ViolationStatus, AnimalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processChipFile } from "@/lib/chips";
import { parseLatLng, isShortLink, expandShortLink } from "@/lib/geo";
import { VIOLATION_STATUSES, DIFFERENCE_REASONS, animalTypeLabel } from "@/lib/constants";

export interface AuditState {
  error?: string;
}

export interface ChipFlagsState {
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
    include: { animalGroups: { include: { locations: true } } }
  });
  if (!decl) return { error: "المعاملة غير موجودة." };

  const rawTypesToProcess = String(formData.get("animalTypesToProcess") ?? "");
  type ParsedEntry = { type: string; sites: Array<{ siteIndex: number }> };
  let parsedEntries: ParsedEntry[] = [];
  try {
    parsedEntries = JSON.parse(rawTypesToProcess);
    if (!Array.isArray(parsedEntries)) parsedEntries = [];
  } catch {
    parsedEntries = [];
  }

  if (parsedEntries.length === 0) {
    return { error: "لم يتم تحديد أنواع الحيوانات المراد معالجتها." };
  }

  // Validate entries against the declaration
  const declGroupMap = new Map(
    decl.animalGroups.map((g) => [g.animalType as string, g])
  );
  for (const entry of parsedEntries) {
    if (!declGroupMap.has(entry.type)) {
      return { error: `نوع الحيوان "${entry.type}" غير موجود في الإقرار.` };
    }
    const group = declGroupMap.get(entry.type)!;
    for (const { siteIndex } of entry.sites) {
      if (!group.locations[siteIndex]) {
        return { error: `الموقع ${siteIndex + 1} غير موجود لنوع ${animalTypeLabel(entry.type)}.` };
      }
    }
  }

  // Check existing audit for optional chip file determination
  const existingAudit = await prisma.audit.findUnique({
    where: { declarationId },
    include: {
      animalResults: {
        include: { _count: { select: { readings: true } } }
      }
    }
  });

  type SitePayload = {
    animalType: AnimalType;
    siteIndex: number;
    violationStatus: ViolationStatus;
    differenceReasons: string[];
    locationLink: string;
    lat: number | null;
    lng: number | null;
    chipContent: string | null;
  };

  const payloads: SitePayload[] = [];

  for (const { type, sites } of parsedEntries) {
    const label = animalTypeLabel(type);
    const group = declGroupMap.get(type)!;

    for (const { siteIndex } of sites) {
      const siteLabel = `${label} — الموقع ${siteIndex + 1}`;

      const locationLink = String(
        formData.get(`locationLink_${type}_${siteIndex}`) ?? ""
      ).trim();
      const vs = String(formData.get(`violationStatus_${type}_${siteIndex}`) ?? "");
      const file = formData.get(`chipFile_${type}_${siteIndex}`);
      const hasFile = file instanceof File && file.size > 0;
      const existingResult = existingAudit?.animalResults.find(
        (r) => r.animalType === type && r.siteIndex === siteIndex
      );
      const hasExistingReadings = (existingResult?._count.readings ?? 0) > 0;
      const hasReadings = hasFile || hasExistingReadings;

      const filledCount = [!!locationLink, hasReadings].filter(Boolean).length;

      if (filledCount === 0) {
        void group.locations[siteIndex];
        continue;
      }

      if (!locationLink)
        return { error: `يرجى إدخال الموقع الجغرافي لـ${siteLabel}.` };
      if (!hasReadings)
        return { error: `يرجى رفع ملف قراءات الشرائح لـ${siteLabel}.` };
      if (!VS.has(vs))
        return { error: `يرجى تحديد حالة المخالفة لـ${siteLabel}.` };

      const reasons = formData
        .getAll(`differenceReason_${type}_${siteIndex}`)
        .map((r) => String(r))
        .filter((r) => DR.has(r));

      let chipContent: string | null = null;
      if (hasFile) {
        try {
          chipContent = await (file as File).text();
        } catch {
          return {
            error: `تعذّرت قراءة ملف الشرائح لـ${siteLabel}. تأكّد من أنه ملف نصي صالح.`
          };
        }
      }

      const coords = await resolveLocation(locationLink);
      if (!coords) {
        return {
          error: `تعذّر استخراج الإحداثيات من موقع ${siteLabel}. أدخل إحداثيات مباشرة (مثال: 29.1234, 47.9876) أو رابط خرائط صالح.`
        };
      }

      void group.locations[siteIndex];

      payloads.push({
        animalType: type as AnimalType,
        siteIndex,
        violationStatus: vs as ViolationStatus,
        differenceReasons: reasons,
        locationLink,
        lat: coords.lat,
        lng: coords.lng,
        chipContent
      });
    }
  }

  // Validate chip file contents before touching the DB
  const FORMAT_HINT = "الصيغة المطلوبة لكل سطر: DDMMYYYY,HHmmss ,رقم الشريحة";
  const processedFiles: Map<string, ReturnType<typeof processChipFile>> = new Map();

  for (const p of payloads) {
    if (p.chipContent === null) continue;
    const key = `${p.animalType}_${p.siteIndex}`;
    const result = processChipFile(p.chipContent);
    const siteLabel = `${animalTypeLabel(p.animalType)} — الموقع ${p.siteIndex + 1}`;

    if (result.parsedCount === 0) {
      return {
        error: `ملف ${siteLabel} لا يحتوي على أي قراءة بالصيغة المطلوبة. ${FORMAT_HINT}`
      };
    }
    if (result.invalidLines.length > 0) {
      const shown = result.invalidLines.slice(0, 10).join("، ");
      const more =
        result.invalidLines.length > 10
          ? ` (و${result.invalidLines.length - 10} أسطر أخرى)`
          : "";
      return {
        error: `ملف ${siteLabel} يحتوي على أسطر بصيغة غير صحيحة: الأسطر ${shown}${more}. ${FORMAT_HINT}`
      };
    }
    if (result.kept.length === 0) {
      return { error: `ملف ${siteLabel} لا يحتوي على قراءات صالحة.` };
    }
    processedFiles.set(key, result);
  }

  // Upsert audit + per-site results inside a transaction
  await prisma.$transaction(async (tx) => {
    const audit = await tx.audit.upsert({
      where: { declarationId },
      update: {},
      create: { declarationId }
    });

    for (const p of payloads) {
      const result = await tx.auditAnimalResult.upsert({
        where: {
          auditId_animalType_siteIndex: {
            auditId: audit.id,
            animalType: p.animalType,
            siteIndex: p.siteIndex
          }
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
          siteIndex: p.siteIndex,
          violationStatus: p.violationStatus,
          differenceReasons: p.differenceReasons,
          locationLink: p.locationLink,
          latitude: p.lat,
          longitude: p.lng
        }
      });

      const chipResult = processedFiles.get(`${p.animalType}_${p.siteIndex}`);
      if (chipResult) {
        await tx.chipReading.deleteMany({ where: { animalResultId: result.id } });
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

export async function updateChipFlags(
  _prev: ChipFlagsState,
  formData: FormData
): Promise<ChipFlagsState> {
  const resultId = Number(formData.get("resultId"));
  if (!Number.isInteger(resultId)) return { error: "معرّف النتيجة غير صالح." };

  const flagsPayloadRaw = String(formData.get("flagsPayload") ?? "");
  type FlagEntry = { id: number; multipleChips: boolean; doesntBelong: boolean };
  let flags: FlagEntry[];
  try {
    flags = JSON.parse(flagsPayloadRaw);
    if (!Array.isArray(flags)) flags = [];
  } catch {
    flags = [];
  }

  const result = await prisma.auditAnimalResult.findUnique({
    where: { id: resultId },
    include: { audit: { select: { declarationId: true } } }
  });
  if (!result) return { error: "النتيجة غير موجودة." };

  // Validate all chip IDs belong to this result before updating
  const validIds = new Set(
    (await prisma.chipReading.findMany({
      where: { animalResultId: resultId },
      select: { id: true }
    })).map((r) => r.id)
  );

  await prisma.$transaction(
    flags
      .filter((f) => validIds.has(f.id))
      .map((f) =>
        prisma.chipReading.update({
          where: { id: f.id },
          data: {
            flaggedMultipleChips: f.multipleChips,
            flaggedDoesntBelong: f.doesntBelong
          }
        })
      )
  );

  revalidatePath(`/supervisor/${result.audit.declarationId}`);
  return {};
}
