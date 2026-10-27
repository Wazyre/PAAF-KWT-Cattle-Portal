// Feature switches for the farmer portal (new registrations / updates to existing declarations).
// Managed from the CLI with `npm run access`; read here on every request, so changes apply instantly.
import type { AccessMode, Feature } from "@prisma/client";
import { prisma } from "./prisma";

export interface FeatureAccessState {
  mode: AccessMode;
  civilIds: string[];
}

// A feature with no stored row is open to everyone.
const DEFAULT_STATE: FeatureAccessState = { mode: "ALL", civilIds: [] };

export function isAllowed(state: FeatureAccessState, civilId: string): boolean {
  if (state.mode === "ALL") return true;
  if (state.mode === "OFF") return false;
  return state.civilIds.includes(civilId);
}

export async function getFeatureState(
  feature: Feature
): Promise<FeatureAccessState> {
  const row = await prisma.featureAccess.findUnique({ where: { feature } });
  return row ? { mode: row.mode, civilIds: row.civilIds } : DEFAULT_STATE;
}

// Whether this citizen may currently use the given feature.
export async function isFeatureAllowed(
  feature: Feature,
  civilId: string
): Promise<boolean> {
  return isAllowed(await getFeatureState(feature), civilId);
}

export async function setFeatureState(
  feature: Feature,
  state: FeatureAccessState
): Promise<void> {
  await prisma.featureAccess.upsert({
    where: { feature },
    create: { feature, ...state },
    update: state
  });
}

export const REGISTRATION_CLOSED_ERROR =
  "التسجيل الجديد غير متاح حالياً لهذا الرقم المدني.";
export const UPDATES_CLOSED_ERROR =
  "تعديل الإقرارات غير متاح حالياً لهذا الرقم المدني.";
