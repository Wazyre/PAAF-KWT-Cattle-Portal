import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ANIMAL_TYPES, gatheringPointLabel } from "@/lib/constants";
import type { AnimalType } from "@prisma/client";
import ScheduleRow from "./ScheduleRow";
import MapLink from "./MapLink";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<string>(ANIMAL_TYPES.map((a) => a.value));

export default async function SupervisorPage({
  searchParams
}: {
  searchParams: { type?: string };
}) {
  const rawType = searchParams.type ?? "";
  const selectedType = (
    VALID_TYPES.has(rawType) ? rawType : ANIMAL_TYPES[0].value
  ) as AnimalType;

  const declarations = await prisma.declaration.findMany({
    where: {
      animalGroups: { some: { animalType: selectedType } }
    },
    include: {
      animalGroups: {
        where: { animalType: selectedType },
        include: { locations: true }
      },
      audit: { select: { id: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  const rows = declarations.map((decl) => {
    const allLocs = decl.animalGroups.flatMap((g) => g.locations);
    const totalChipped = allLocs.reduce((sum, l) => sum + l.chippedCount, 0);
    const gatheringPoints = [
      ...new Set(allLocs.map((l) => gatheringPointLabel(l.gatheringPoint)))
    ].join("، ");
    const firstLoc = allLocs[0];
    return {
      declarationId: decl.id,
      name: decl.name,
      civilId: decl.civilId,
      gatheringPoints,
      lat: firstLoc?.latitude ?? null,
      lng: firstLoc?.longitude ?? null,
      locationCount: allLocs.length,
      totalChipped,
      hasAudit: !!decl.audit
    };
  });

  const selectedLabel =
    ANIMAL_TYPES.find((a) => a.value === selectedType)?.label ?? "";

  return (
    <div className="space-y-5">
      <div className="card">
        <h1 className="text-xl font-bold text-gov-dark">جدول الزيارات الميدانية</h1>
        <p className="mt-1 text-sm text-gray-600">
          اختر نوع الحيوان لعرض قائمة المربّين المقرّر زيارتهم.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ANIMAL_TYPES.map((at) => (
          <Link
            key={at.value}
            href={`/supervisor?type=${at.value}`}
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

      {rows.length === 0 ? (
        <div className="card text-center text-sm text-gray-500">
          لا توجد إقرارات مسجّلة لـ{selectedLabel}.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gov-light text-gov-dark">
                <th className="border border-gray-300 px-3 py-2 text-center">#</th>
                <th className="border border-gray-300 px-3 py-2 text-right">
                  الاسم
                </th>
                <th className="border border-gray-300 px-3 py-2 text-center">
                  الرقم المدني
                </th>
                <th className="border border-gray-300 px-3 py-2 text-right">
                  نقطة التجمّع
                </th>
                <th className="border border-gray-300 px-3 py-2 text-center">
                  الموقع الجغرافي
                </th>
                <th className="border border-gray-300 px-3 py-2 text-center">
                  عدد المُرقّمة
                </th>
                <th className="border border-gray-300 px-3 py-2 text-center">
                  التدقيق
                </th>
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
                  <td className="border border-gray-300 px-3 py-2">
                    {row.gatheringPoints}
                    {row.locationCount > 1 && (
                      <span className="mr-1 text-xs text-gray-400">
                        ({row.locationCount} مواقع)
                      </span>
                    )}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center">
                    {row.lat !== null && row.lng !== null ? (
                      <MapLink lat={row.lat} lng={row.lng} />
                    ) : (
                      <span className="text-gray-400">—</span>
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
      )}

      <Link href="/" className="text-sm font-semibold text-gov">
        ← العودة للرئيسية
      </Link>
    </div>
  );
}
