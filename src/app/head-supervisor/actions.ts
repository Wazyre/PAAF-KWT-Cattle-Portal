"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { AnimalType, GatheringPoint, GroupType } from "@prisma/client";

export interface ActionState {
  error?: string;
}

export async function assignGroup(formData: FormData): Promise<void> {
  const animalType = String(formData.get("animalType") ?? "") as AnimalType;
  const gatheringPoint = String(formData.get("gatheringPoint") ?? "") as GatheringPoint;
  const groupType = String(formData.get("groupType") ?? "") as GroupType;
  const soloRaw = formData.get("soloDeclarationId");
  const soloDeclarationId = soloRaw ? Number(soloRaw) : null;
  const supervisorIdRaw = String(formData.get("supervisorId") ?? "").trim();
  const supervisorId = supervisorIdRaw !== "" ? Number(supervisorIdRaw) : null;

  if (!animalType || !gatheringPoint || !groupType) return;

  const groupKey =
    soloDeclarationId != null
      ? `${animalType}_${gatheringPoint}_SOLO_${soloDeclarationId}`
      : `${animalType}_${gatheringPoint}_SMALL`;

  if (!supervisorId) {
    await prisma.assignment.deleteMany({ where: { groupKey } });
  } else {
    await prisma.assignment.upsert({
      where: { groupKey },
      update: { supervisorId },
      create: {
        supervisorId,
        animalType,
        gatheringPoint,
        groupType,
        soloDeclarationId,
        groupKey
      }
    });
  }

  revalidatePath("/head-supervisor");
}

export async function addSupervisor(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const civilId = String(formData.get("civilId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!civilId || !name) return { error: "يرجى إدخال الرقم المدني والاسم." };
  if (!/^\d{12}$/.test(civilId))
    return { error: "الرقم المدني يجب أن يتكون من 12 رقماً." };

  await prisma.supervisor.upsert({
    where: { civilId },
    update: { name },
    create: { civilId, name }
  });

  revalidatePath("/head-supervisor");
  return {};
}

export async function removeSupervisor(formData: FormData): Promise<void> {
  const id = Number(formData.get("supervisorId"));
  if (!Number.isFinite(id) || id <= 0) return;
  await prisma.supervisor.delete({ where: { id } });
  revalidatePath("/head-supervisor");
}
