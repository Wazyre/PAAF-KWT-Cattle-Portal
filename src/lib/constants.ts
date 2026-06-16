// Domain enum values (ASCII, persisted) paired with Arabic display labels, plus proximity thresholds.
// Central Arabic labels for all enums. UI reads from here; DB stores ASCII enums.

export const GATHERING_POINTS = [
  { value: "WAFRA", label: "الوفرة" },
  { value: "JAHRA", label: "الجهراء" },
  { value: "KABD", label: "كبد" },
  { value: "ABDALI", label: "العبدلي" },
  { value: "MINA_ABDULLAH", label: "ميناء عبدالله" }
] as const;

export const ANIMAL_TYPES = [
  { value: "SHEEP_GOATS", label: "أغنام وماعز" },
  { value: "CAMELS", label: "إبل" },
  { value: "COWS", label: "أبقار" }
] as const;

export const VIOLATION_STATUSES = [
  { value: "NONE", label: "لا توجد مخالفة" },
  { value: "VIOLATION", label: "توجد مخالفة" }
] as const;

export const DIFFERENCE_REASONS = [
  { value: "NOT_CHIPPED", label: "لا تحمل شرائح" },
  { value: "MULTIPLE_CHIPS", label: "الحيوان يحمل أكثر من شريحة" },
  { value: "CHIP_DOESNT_BELONG", label: "أرقام الشرائح ليست مسجلة باسم المربي" }
] as const;

// Generic enum value to Arabic label lookup; returns the value itself if no label is registered.
function labelOf(
  list: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined
): string {
  if (!value) return "";
  return list.find((x) => x.value === value)?.label ?? value;
}

export const gatheringPointLabel = (v: string | null | undefined) =>
  labelOf(GATHERING_POINTS, v);
export const animalTypeLabel = (v: string | null | undefined) =>
  labelOf(ANIMAL_TYPES, v);
export const violationStatusLabel = (v: string | null | undefined) =>
  labelOf(VIOLATION_STATUSES, v);
export const differenceReasonLabel = (v: string | null | undefined) =>
  labelOf(DIFFERENCE_REASONS, v);

// Proximity threshold for "too close" farmer locations / readings.
export const PROXIMITY_METERS = 5;
export const PROXIMITY_SECONDS = 5;

// Minimum distance between two locations declared by the same farmer for the same animal type.
export const MIN_SITE_DISTANCE_METERS = 100;
