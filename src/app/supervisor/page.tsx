import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ANIMAL_TYPES, gatheringPointLabel } from "@/lib/constants";
import type { AnimalType, GatheringPoint } from "@prisma/client";
import ScheduleRow from "./ScheduleRow";
import MapLink from "./MapLink";

export const dynamic = "force-dynamic";

const HEAD_THRESHOLD = 750;

type FarmerRow = {
  declarationId: number;
  name: string;
  civilId: string;
  lat: number | null;
  lng: number | null;
  locationCount: number;
  totalChipped: number;
  hasAudit: boolean;
};

function FarmerTable({
  rows,
  selectedType
}: {
  rows: FarmerRow[];
  selectedType: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gov-light text-gov-dark">
            <th className="border border-gray-300 px-3 py-2 text-center">#</th>
            <th className="border border-gray-300 px-3 py-2 text-right">الاسم</th>
            <th className="border border-gray-300 px-3 py-2 text-center">الرقم المدني</th>
            <th className="border border-gray-300 px-3 py-2 text-center">الموقع الجغرافي</th>
            <th className="border border-gray-300 px-3 py-2 text-center">عدد المُرقّمة</th>
            <th className="border border-gray-300 px-3 py-2 text-center">التدقيق</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <ScheduleRow
              key={row.declarationId}
              href={`/supervisor/${row.declarationId}?animalType=${selectedType}`}
            >
              <td className="border border-gray-300 px-3 py-2 text-center text-gray-500">
                {idx + 1}
              </td>
              <td className="border border-gray-300 px-3 py-2 font-semibold text-gov-dark">
                {row.name}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center font-mono text-xs">
                {row.civilId}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center">
                {row.lat !== null && row.lng !== null ? (
                  <MapLink lat={row.lat} lng={row.lng} />
                ) : (
                  <span className="text-gray-400">-</span>
                )}
                {row.locationCount > 1 && (
                  <span className="mr-1 text-xs text-gray-400">
                    ({row.locationCount} مواقع)
                  </span>
                )}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center font-semibold">
                {row.totalChipped}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-center">
                {row.hasAudit ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                    مكتمل
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                    لم يُدقّق
                  </span>
                )}
              </td>
            </ScheduleRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SupervisorPage({
  searchParams
}: {
  searchParams: { civilId?: string; type?: string };
}) {
  const civilId = (searchParams.civilId ?? "").trim();

  if (!civilId) {
    return (
      <div className="space-y-5">
        <div className="card">
          <h1 className="text-xl font-bold text-gov-dark">بوابة المفتشين الميدانيين</h1>
          <p className="mt-1 text-sm text-gray-600">
            يرجى إدخال رقمك المدني للوصول إلى جدول الزيارات المسنَد إليك.
          </p>
        </div>
        <div className="card max-w-sm">
          <form method="GET" className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-semibold text-gray-700">الرقم المدني</label>
              <input
                name="civilId"
                type="text"
                inputMode="numeric"
                maxLength={12}
                placeholder="XXXXXXXXXXXX"
                required
                autoFocus
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gov focus:outline-none"
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              دخول
            </button>
          </form>
        </div>
        <Link href="/" className="text-sm font-semibold text-gov">
          ← العودة للرئيسية
        </Link>
      </div>
    );
  }

  const supervisor = await prisma.supervisor.findUnique({ where: { civilId } });

  if (!supervisor) {
    return (
      <div className="space-y-5">
        <div className="card">
          <h1 className="text-xl font-bold text-gov-dark">بوابة المفتشين الميدانيين</h1>
        </div>
        <div className="card">
          <p className="text-sm text-red-600">
            الرقم المدني غير مسجّل. يرجى التواصل مع رئيس المفتشين.
          </p>
        </div>
        <Link href="/supervisor" className="text-sm font-semibold text-gov">
          ← المحاولة مجدداً
        </Link>
      </div>
    );
  }

  const allAssignments = await prisma.assignment.findMany({
    where: { supervisorId: supervisor.id },
    include: {
      soloDeclaration: {
        include: {
          animalGroups: { include: { locations: true } },
          audit: { select: { id: true } }
        }
      }
    }
  });

  if (allAssignments.length === 0) {
    return (
      <div className="space-y-5">
        <div className="card">
          <h1 className="text-xl font-bold text-gov-dark">مرحباً، {supervisor.name}</h1>
          <p className="mt-1 text-sm text-gray-600">جدول الزيارات الميدانية</p>
        </div>
        <div className="card text-center text-sm text-gray-500">
          لم يتم إسناد أي مجموعات إليك بعد.
        </div>
        <Link href="/" className="text-sm font-semibold text-gov">
          ← العودة للرئيسية
        </Link>
      </div>
    );
  }

  const assignedTypes = [
    ...new Set(allAssignments.map((a) => a.animalType as AnimalType))
  ];
  const rawType = searchParams.type ?? "";
  const selectedType = (
    assignedTypes.includes(rawType as AnimalType) ? rawType : assignedTypes[0]
  ) as AnimalType;

  const typeAssignments = allAssignments.filter((a) => a.animalType === selectedType);

  type AssignmentView = {
    key: string;
    gpLabel: string;
    groupType: "SMALL" | "SOLO";
    soloName?: string;
    soloChipped?: number;
    farmers: FarmerRow[];
  };

  const assignmentViews: AssignmentView[] = [];

  for (const asgn of typeAssignments) {
    if (asgn.groupType === "SOLO") {
      const decl = asgn.soloDeclaration;
      if (!decl) continue;

      const gpLocs = decl.animalGroups
        .filter((g) => g.animalType === selectedType)
        .flatMap((g) => g.locations)
        .filter((l) => l.gatheringPoint === asgn.gatheringPoint);

      const totalChipped = gpLocs.reduce((s, l) => s + l.chippedCount, 0);
      const firstLoc = gpLocs[0];

      assignmentViews.push({
        key: asgn.groupKey,
        gpLabel: gatheringPointLabel(asgn.gatheringPoint),
        groupType: "SOLO",
        soloName: decl.name,
        soloChipped: totalChipped,
        farmers: [
          {
            declarationId: decl.id,
            name: decl.name,
            civilId: decl.civilId,
            lat: firstLoc?.latitude ?? null,
            lng: firstLoc?.longitude ?? null,
            locationCount: gpLocs.length,
            totalChipped,
            hasAudit: !!decl.audit
          }
        ]
      });
    } else {
      // Fetch all small-group declarations at this GP for the selected animal type
      const decls = await prisma.declaration.findMany({
        where: {
          animalGroups: {
            some: {
              animalType: selectedType,
              locations: {
                some: { gatheringPoint: asgn.gatheringPoint as GatheringPoint }
              }
            }
          }
        },
        include: {
          animalGroups: {
            where: { animalType: selectedType },
            include: {
              locations: {
                where: { gatheringPoint: asgn.gatheringPoint as GatheringPoint }
              }
            }
          },
          audit: { select: { id: true } }
        },
        orderBy: { createdAt: "asc" }
      });

      const farmers: FarmerRow[] = [];
      for (const decl of decls) {
        const locs = decl.animalGroups.flatMap((g) => g.locations);
        const totalChipped = locs.reduce((s, l) => s + l.chippedCount, 0);
        if (totalChipped > HEAD_THRESHOLD) continue;
        const firstLoc = locs[0];
        farmers.push({
          declarationId: decl.id,
          name: decl.name,
          civilId: decl.civilId,
          lat: firstLoc?.latitude ?? null,
          lng: firstLoc?.longitude ?? null,
          locationCount: locs.length,
          totalChipped,
          hasAudit: !!decl.audit
        });
      }

      assignmentViews.push({
        key: asgn.groupKey,
        gpLabel: gatheringPointLabel(asgn.gatheringPoint),
        groupType: "SMALL",
        farmers
      });
    }
  }

  const assignedLabel = ANIMAL_TYPES.find((a) => a.value === selectedType)?.label ?? "";

  return (
    <div className="space-y-5">
      <div className="card">
        <h1 className="text-xl font-bold text-gov-dark">مرحباً، {supervisor.name}</h1>
        <p className="mt-1 text-sm text-gray-600">
          جدول الزيارات الميدانية المسنَدة إليك
        </p>
      </div>

      {assignedTypes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {ANIMAL_TYPES.filter((at) =>
            assignedTypes.includes(at.value as AnimalType)
          ).map((at) => (
            <Link
              key={at.value}
              href={`/supervisor?civilId=${encodeURIComponent(civilId)}&type=${at.value}`}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                at.value === selectedType
                  ? "border-gov bg-gov text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gov hover:text-gov"
              }`}
            >
              {at.label}
            </Link>
          ))}
        </div>
      )}

      {assignmentViews.length === 0 ? (
        <div className="card text-center text-sm text-gray-500">
          لا توجد مجموعات مسندة لـ{assignedLabel}.
        </div>
      ) : (
        <div className="space-y-4">
          {assignmentViews.map((view) => (
            <div key={view.key} className="card overflow-hidden p-0">
              {view.groupType === "SMALL" ? (
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
                  <span className="text-sm font-semibold text-gray-700">
                    {view.gpLabel} - مجموعة المربّين (حتى {HEAD_THRESHOLD} رأس)
                  </span>
                  <span className="text-xs text-gray-500">
                    {view.farmers.length} مربّي
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
                  <span className="text-sm font-semibold text-amber-800">
                    {view.gpLabel} - مربّي مفرد: {view.soloName}
                  </span>
                  <span className="text-xs font-semibold text-amber-700">
                    {view.soloChipped} رأس
                  </span>
                </div>
              )}
              <FarmerTable rows={view.farmers} selectedType={selectedType} />
            </div>
          ))}
        </div>
      )}

      <Link href="/" className="text-sm font-semibold text-gov">
        ← العودة للرئيسية
      </Link>
    </div>
  );
}
