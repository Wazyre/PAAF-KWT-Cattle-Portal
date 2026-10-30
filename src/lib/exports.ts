// CSV export "macros" (not-declared, declared, low heads, approved audits, audit data), shared by `npm run export` and /api/export/[macro].
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { toCsv, type CsvCell } from "./csv";
import { totalHeads } from "./heads";
import {
  ANIMAL_TYPES,
  LOW_HEAD_THRESHOLD,
  animalTypeLabel,
  differenceReasonLabel,
  gatheringPointLabel,
  violationStatusLabel,
  visitFailureReasonLabel
} from "./constants";

export interface ExportTable {
  headers: string[];
  rows: CsvCell[][];
}

export interface ExportMacro {
  key: string;
  label: string;
  description: string;
  build: () => Promise<ExportTable>;
}

const yesNo = (v: boolean) => (v ? "نعم" : "لا");
const flag = (v: boolean) => (v ? "نعم" : "");
const fmtDate = (d: Date | null | undefined) =>
  d ? d.toISOString().replace("T", " ").slice(0, 19) : "";

// Declarations with their locations (in a stable order) and the minimal audit data needed for status columns.
const declarationInclude = {
  animalGroups: {
    orderBy: { id: "asc" },
    include: { locations: { orderBy: { id: "asc" } } }
  },
  audit: {
    include: {
      animalResults: {
        select: { animalType: true, siteIndex: true, violationStatus: true }
      }
    }
  }
} satisfies Prisma.DeclarationInclude;

type Decl = Prisma.DeclarationGetPayload<{ include: typeof declarationInclude }>;

function loadDeclarations(): Promise<Decl[]> {
  return prisma.declaration.findMany({
    include: declarationInclude,
    orderBy: { createdAt: "asc" }
  });
}

// Number of declared locations that have an audit result, and how many of those are violations.
function auditProgress(d: Decl): { total: number; audited: number; violations: number } {
  const results = new Map(
    (d.audit?.animalResults ?? []).map((r) => [`${r.animalType}_${r.siteIndex}`, r])
  );
  let total = 0;
  let audited = 0;
  let violations = 0;
  for (const g of d.animalGroups) {
    g.locations.forEach((_, i) => {
      total++;
      const r = results.get(`${g.animalType}_${i}`);
      if (r) {
        audited++;
        if (r.violationStatus === "VIOLATION") violations++;
      }
    });
  }
  return { total, audited, violations };
}

function headsByType(d: Decl, type: string): number {
  return totalHeads(d.animalGroups.filter((g) => g.animalType === type));
}

const lowHeadHeader = `أقل من ${LOW_HEAD_THRESHOLD} رأس`;

// One row per declaration; shared by the "declared" and "low heads" exports.
function declarationSummary(decls: Decl[]): ExportTable {
  return {
    headers: [
      "رقم المعاملة",
      "الاسم",
      "الرقم المدني",
      "الهاتف",
      "الهاتف الإضافي",
      "إجمالي الرؤوس",
      ...ANIMAL_TYPES.map((a) => a.label),
      "عدد المواقع",
      lowHeadHeader,
      "تاريخ الإقرار",
      "آخر تعديل"
    ],
    rows: decls.map((d) => [
      d.id,
      d.name,
      d.civilId,
      d.mobile,
      d.mobile2,
      totalHeads(d.animalGroups),
      ...ANIMAL_TYPES.map((a) => headsByType(d, a.value)),
      d.animalGroups.reduce((n, g) => n + g.locations.length, 0),
      yesNo(d.lowHeadCount),
      fmtDate(d.createdAt),
      fmtDate(d.updatedAt)
    ])
  };
}

async function notDeclared(): Promise<ExportTable> {
  const rows = await prisma.$queryRaw<{ civilId: string; name: string }[]>`
    SELECT c."civilId", c."name"
    FROM "Citizen" c
    LEFT JOIN "Declaration" d ON d."civilId" = c."civilId"
    WHERE d."id" IS NULL
    ORDER BY c."name", c."civilId"`;
  return {
    headers: ["الاسم", "الرقم المدني"],
    rows: rows.map((r) => [r.name, r.civilId])
  };
}

async function declared(): Promise<ExportTable> {
  return declarationSummary(await loadDeclarations());
}

async function lowHeads(): Promise<ExportTable> {
  const decls = (await loadDeclarations()).filter((d) => d.lowHeadCount);
  decls.sort((a, b) => totalHeads(a.animalGroups) - totalHeads(b.animalGroups));
  return declarationSummary(decls);
}

// Every declared location has an audit result AND the head investigator approved the audit.
async function fullyApproved(): Promise<ExportTable> {
  const rows: CsvCell[][] = [];
  for (const d of await loadDeclarations()) {
    const p = auditProgress(d);
    if (!d.audit?.approvedAt || p.total === 0 || p.audited !== p.total) continue;
    rows.push([
      d.id,
      d.name,
      d.civilId,
      totalHeads(d.animalGroups),
      p.total,
      p.audited,
      p.violations,
      fmtDate(d.audit.approvedAt)
    ]);
  }
  return {
    headers: [
      "رقم المعاملة",
      "الاسم",
      "الرقم المدني",
      "إجمالي الرؤوس",
      "عدد المواقع",
      "المواقع المدققة",
      "المواقع المخالفة",
      "تاريخ الاعتماد"
    ],
    rows
  };
}

// One row per audited site (plus one row for a failed visit with no site data).
async function auditData(): Promise<ExportTable> {
  const audits = await prisma.audit.findMany({
    orderBy: { declarationId: "asc" },
    include: {
      declaration: {
        include: {
          animalGroups: {
            orderBy: { id: "asc" },
            include: { locations: { orderBy: { id: "asc" } } }
          }
        }
      },
      animalResults: {
        orderBy: [{ animalType: "asc" }, { siteIndex: "asc" }],
        include: { _count: { select: { readings: true } } }
      }
    }
  });

  const rows: CsvCell[][] = [];
  for (const a of audits) {
    if (a.animalResults.length === 0 && !a.visitFailureReason) continue;
    const d = a.declaration;
    const auditCols = [
      visitFailureReasonLabel(a.visitFailureReason),
      a.visitFailureNote,
      yesNo(!!a.approvedAt),
      fmtDate(a.approvedAt),
      fmtDate(a.createdAt)
    ];
    const head = [d.id, d.name, d.civilId];

    if (a.animalResults.length === 0) {
      rows.push([...head, ...Array(12).fill(""), ...auditCols]);
      continue;
    }
    for (const r of a.animalResults) {
      const loc = d.animalGroups.find((g) => g.animalType === r.animalType)
        ?.locations[r.siteIndex];
      rows.push([
        ...head,
        animalTypeLabel(r.animalType),
        r.siteIndex + 1,
        loc ? gatheringPointLabel(loc.gatheringPoint) : "",
        loc?.chippedCount ?? "",
        r.manualCount,
        r._count.readings,
        r.doesntBelongCount,
        violationStatusLabel(r.violationStatus),
        (r.differenceReasons as string[]).map(differenceReasonLabel).join("، "),
        r.locationLink,
        r.latitude,
        r.longitude,
        ...auditCols
      ]);
    }
  }
  return {
    headers: [
      "رقم المعاملة",
      "الاسم",
      "الرقم المدني",
      "نوع الحيوان",
      "رقم الموقع",
      "نقطة التجمّع",
      "العدد المُصرَّح به",
      "العدد اليدوي",
      "عدد قراءات الشرائح",
      "شرائح غير مسجلة باسم المربي",
      "حالة المخالفة",
      "أسباب الاختلاف",
      "رابط الموقع",
      "خط العرض",
      "خط الطول",
      "سبب تعذّر الزيارة",
      "تفاصيل السبب (أخرى)",
      "معتمد",
      "تاريخ الاعتماد",
      "تاريخ التدقيق"
    ],
    rows
  };
}

// One row per chip reading with its flags (can be large).
async function auditReadings(): Promise<ExportTable> {
  const readings = await prisma.chipReading.findMany({
    orderBy: [{ animalResultId: "asc" }, { readAt: "asc" }],
    include: {
      animalResult: {
        include: {
          audit: {
            include: {
              declaration: { select: { id: true, name: true, civilId: true } }
            }
          }
        }
      }
    }
  });
  return {
    headers: [
      "رقم المعاملة",
      "الاسم",
      "الرقم المدني",
      "نوع الحيوان",
      "رقم الموقع",
      "وقت القراءة",
      "رقم الشريحة",
      "الشريحة الخام",
      "رمز/نجمة",
      "تقارب",
      "أكثر من شريحة",
      "ليست باسم المربي"
    ],
    rows: readings.map((r) => {
      const d = r.animalResult.audit.declaration;
      return [
        d.id,
        d.name,
        d.civilId,
        animalTypeLabel(r.animalResult.animalType),
        r.animalResult.siteIndex + 1,
        fmtDate(r.readAt),
        r.chipNumber,
        r.rawChip,
        flag(r.flaggedSymbol),
        flag(r.flaggedProximity),
        flag(r.flaggedMultipleChips),
        flag(r.flaggedDoesntBelong)
      ];
    })
  };
}

// Master list: every imported farmer with declaration / audit / approval status.
async function allFarmers(): Promise<ExportTable> {
  const [citizens, decls] = await Promise.all([
    prisma.citizen.findMany({ orderBy: [{ name: "asc" }, { civilId: "asc" }] }),
    loadDeclarations()
  ]);
  const byCivilId = new Map(decls.map((d) => [d.civilId, d]));
  return {
    headers: [
      "الاسم",
      "الرقم المدني",
      "حالة الإقرار",
      "رقم المعاملة",
      "إجمالي الرؤوس",
      lowHeadHeader,
      "حالة التدقيق",
      "معتمد"
    ],
    rows: citizens.map((c) => {
      const d = byCivilId.get(c.civilId);
      if (!d) return [c.name, c.civilId, "لم يُقرّ", "", "", "", "", ""];
      const p = auditProgress(d);
      const status =
        p.audited === 0 ? "لم يُدقّق" : p.audited === p.total ? "مكتمل" : "جزئي";
      return [
        c.name,
        c.civilId,
        "أقرّ",
        d.id,
        totalHeads(d.animalGroups),
        yesNo(d.lowHeadCount),
        status,
        yesNo(!!d.audit?.approvedAt)
      ];
    })
  };
}

export const EXPORT_MACROS: ExportMacro[] = [
  {
    key: "not-declared",
    label: "مربّون لم يقدّموا إقرارهم",
    description: "الاسم والرقم المدني لكل مربٍّ مستورد لم يُقدّم إقراراً بعد.",
    build: notDeclared
  },
  {
    key: "declared",
    label: "مربّون قدّموا إقرارهم",
    description: "بيانات المربّين الذين قدّموا الإقرار مع أعداد الرؤوس والمواقع.",
    build: declared
  },
  {
    key: "low-heads",
    label: `مربّون أقل من ${LOW_HEAD_THRESHOLD} رأس`,
    description: `المربّون الذين أقرّوا بإجمالي أقل من ${LOW_HEAD_THRESHOLD} رأس.`,
    build: lowHeads
  },
  {
    key: "fully-approved",
    label: "مربّون دُقّقت جميع مواقعهم واعتُمدت",
    description: "جميع مواقع المربّي مدققة واعتمد رئيس المفتشين التدقيق.",
    build: fullyApproved
  },
  {
    key: "audit-data",
    label: "بيانات التدقيق الكاملة",
    description: "نتائج التدقيق لكل موقع مدقَّق (الأعداد، المخالفات، الأسباب، الموقع).",
    build: auditData
  },
  {
    key: "audit-readings",
    label: "قراءات الشرائح",
    description: "كل قراءة شريحة محفوظة مع تنبيهاتها (ملف كبير).",
    build: auditReadings
  },
  {
    key: "all-farmers",
    label: "القائمة الرئيسية للمربّين",
    description: "جميع المربّين المستوردين مع حالة الإقرار والتدقيق والاعتماد.",
    build: allFarmers
  }
];

export function findMacro(key: string): ExportMacro | undefined {
  return EXPORT_MACROS.find((m) => m.key === key);
}

export function exportFilename(key: string, date = new Date()): string {
  return `${key}-${date.toISOString().slice(0, 10)}.csv`;
}

export async function buildCsv(macro: ExportMacro): Promise<string> {
  const { headers, rows } = await macro.build();
  return toCsv(headers, rows);
}
