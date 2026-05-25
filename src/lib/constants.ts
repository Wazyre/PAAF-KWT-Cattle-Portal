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
  { value: "NOT_CHIPPED", label: "لم يتم الترقيم" },
  { value: "UNREADABLE", label: "تعذرت قراءة الشرائح" },
  { value: "MULTIPLE_CHIPS", label: "الحيوان يحمل أكثر من شريحة" },
  {
    value: "UNREGISTERED_TRADE",
    label: "بيع أو شراء حيوانات دون تسجيل المعاملة لدى الجمعية"
  },
  { value: "SLAUGHTER_DEATH", label: "ذبح أو نفوق الحيوان" },
  { value: "CHIP_DOESNT_BELONG", label: "أرقام الشرائح ليست مسجلة باسم المربي"},
  { value: "OTHER", label: "أسباب أخرى" }
] as const;

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
