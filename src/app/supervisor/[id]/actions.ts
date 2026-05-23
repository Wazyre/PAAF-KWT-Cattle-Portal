"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ViolationStatus, DifferenceReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processChipFile, windowInputMs } from "@/lib/chips";
import { VIOLATION_STATUSES, DIFFERENCE_REASONS } from "@/lib/constants";

export interface AuditState {
  error?: string;
}

const VS = new Set<string>(VIOLATION_STATUSES.map((v) => v.value));
const DR = new Set<string>(DIFFERENCE_REASONS.map((d) => d.value));

export async function submitAudit(
  _prev: AuditState,
  formData: FormData
): Promise<AuditState> {
  const declarationId = Number(formData.get("declarationId"));
  if (!Number.isInteger(declarationId)) {
    return { error: "رقم المعاملة غير صالح." };
  }
  const decl = await prisma.declaration.findUnique({
    where: { id: declarationId }
  });
  if (!decl) return { error: "المعاملة غير موجودة." };

  const startRaw = String(formData.get("chipReadStart") ?? "");
  const endRaw = String(formData.get("chipReadEnd") ?? "");
  const startMs = windowInputMs(startRaw);
  const endMs = windowInputMs(endRaw);
  if (startMs === null || endMs === null) {
    return { error: "يرجى تحديد وقت بداية ونهاية قراءة الشرائح." };
  }
  if (endMs <= startMs) {
    return { error: "وقت النهاية يجب أن يكون بعد وقت البداية." };
  }

  const violationStatus = String(formData.get("violationStatus") ?? "");
  if (!VS.has(violationStatus)) {
    return { error: "يرجى تحديد حالة المخالفة." };
  }
  const differenceReasonRaw = String(formData.get("differenceReason") ?? "");
  const differenceReason = DR.has(differenceReasonRaw)
    ? differenceReasonRaw
    : null;

  const file = formData.get("chipFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "يرجى رفع ملف قراءات الشرائح." };
  }

  let content: string;
  try {
    content = await file.text();
  } catch {
    return { error: "تعذّرت قراءة الملف المرفوع. تأكّد من أنه ملف نصي صالح." };
  }

  const result = processChipFile(content, startMs, endMs);
  const FORMAT_HINT = "الصيغة المطلوبة لكل سطر: DDMMYYYY,HHmmss ,رقم الشريحة";

  // Safety catch: reject files that don't match the expected format.
  if (result.parsedCount === 0) {
    return {
      error: `الملف لا يحتوي على أي قراءة بالصيغة المطلوبة. ${FORMAT_HINT}`
    };
  }
  if (result.invalidLines.length > 0) {
    const shown = result.invalidLines.slice(0, 10).join("، ");
    const more =
      result.invalidLines.length > 10
        ? ` (و${result.invalidLines.length - 10} أسطر أخرى)`
        : "";
    return {
      error: `يحتوي الملف على أسطر بصيغة غير صحيحة: الأسطر ${shown}${more}. ${FORMAT_HINT}`
    };
  }
  if (result.kept.length === 0) {
    return {
      error:
        "لا توجد قراءات تقع ضمن وقت البداية والنهاية المحدّدين. تحقّق من الأوقات أو من محتوى الملف."
    };
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.audit.findUnique({
      where: { declarationId }
    });
    if (existing) {
      await tx.audit.delete({ where: { declarationId } });
    }
    await tx.audit.create({
      data: {
        declarationId,
        chipReadStart: new Date(startMs),
        chipReadEnd: new Date(endMs),
        violationStatus: violationStatus as ViolationStatus,
        differenceReason: (differenceReason as DifferenceReason) ?? null,
        readings: {
          create: result.kept.map((r) => ({
            readAt: new Date(r.ms),
            chipNumber: r.chipNumber,
            rawChip: r.rawChip,
            flaggedSymbol: r.flaggedSymbol,
            flaggedProximity: r.flaggedProximity
          }))
        }
      }
    });
  });

  revalidatePath(`/supervisor/${declarationId}`);
  redirect(`/supervisor/${declarationId}?saved=1`);
}
