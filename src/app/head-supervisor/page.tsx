import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ANIMAL_TYPES, GATHERING_POINTS, gatheringPointLabel } from "@/lib/constants";
import type { AnimalType } from "@prisma/client";
import ScheduleRow from "@/app/supervisor/ScheduleRow";
import MapLink from "@/app/supervisor/MapLink";
import AssignControl from "./AssignControl";
import SupervisorManager from "./SupervisorManager";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<string>(ANIMAL_TYPES.map((a) => a.value));
const GP_ORDER = GATHERING_POINTS.map((g) => g.value);
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

type GpGroup = {
  gpValue: string;
  gpLabel: string;
  smallFarmers: FarmerRow[];
  largeFarmers: FarmerRow[];
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
              href={`/head-supervisor/${row.declarationId}?animalType=${selectedType}`}
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

export default async function HeadSupervisorPage({
  searchParams
}: {
  searchParams: { type?: string };
}) {
  const rawType = searchParams.type ?? "";
  const selectedType = (
    VALID_TYPES.has(rawType) ? rawType : ANIMAL_TYPES[0].value
  ) as AnimalType;

  const [supervisors, assignments, declarations] = await Promise.all([
    prisma.supervisor.findMany({ orderBy: { name: "asc" } }),
    prisma.assignment.findMany({ where: { animalType: selectedType } }),
    prisma.declaration.findMany({
      where: { animalGroups: { some: { animalType: selectedType } } },
      include: {
        animalGroups: {
          where: { animalType: selectedType },
          include: { locations: true }
        },
        audit: { select: { id: true } }
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const assignmentMap = new Map<string, number>();
  for (const a of assignments) assignmentMap.set(a.groupKey, a.supervisorId);

  // Assigned supervisor name lookup
  const supervisorMap = new Map<number, string>();
  for (const s of supervisors) supervisorMap.set(s.id, s.name);

  const gpMap = new Map<string, GpGroup>();

  for (const decl of declarations) {
    const allLocs = decl.animalGroups.flatMap((g) => g.locations);

    const locsByGP = new Map<string, typeof allLocs>();
    for (const loc of allLocs) {
      const arr = locsByGP.get(loc.gatheringPoint) ?? [];
      arr.push(loc);
      locsByGP.set(loc.gatheringPoint, arr);
    }

    for (const [gpValue, locs] of locsByGP) {
      if (!gpMap.has(gpValue)) {
        gpMap.set(gpValue, {
          gpValue,
          gpLabel: gatheringPointLabel(gpValue),
          smallFarmers: [],
          largeFarmers: []
        });
      }

      const totalChipped = locs.reduce((sum, l) => sum + l.chippedCount, 0);
      const firstLoc = locs[0];
      const row: FarmerRow = {
        declarationId: decl.id,
        name: decl.name,
        civilId: decl.civilId,
        lat: firstLoc?.latitude ?? null,
        lng: firstLoc?.longitude ?? null,
        locationCount: locs.length,
        totalChipped,
        hasAudit: !!decl.audit
      };

      const group = gpMap.get(gpValue)!;
      if (totalChipped <= HEAD_THRESHOLD) group.smallFarmers.push(row);
      else group.largeFarmers.push(row);
    }
  }

  const gpGroups = [...gpMap.values()].sort((a, b) => {
    const ai = GP_ORDER.indexOf(a.gpValue as (typeof GP_ORDER)[number]);
    const bi = GP_ORDER.indexOf(b.gpValue as (typeof GP_ORDER)[number]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const selectedLabel = ANIMAL_TYPES.find((a) => a.value === selectedType)?.label ?? "";

  return (
    <div className="space-y-5">
      <div className="card">
        <h1 className="text-xl font-bold text-gov-dark">بوابة رئيس المفتشين</h1>
        <p className="mt-1 text-sm text-gray-600">
          إدارة المفتشين الميدانيين وتوزيع مجموعات التدقيق عليهم.
        </p>
      </div>

      <SupervisorManager supervisors={supervisors} />

      <div className="flex flex-wrap gap-2">
        {ANIMAL_TYPES.map((at) => (
          <Link
            key={at.value}
            href={`/head-supervisor?type=${at.value}`}
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

      {declarations.length === 0 ? (
        <div className="card text-center text-sm text-gray-500">
          لا توجد إقرارات مسجّلة لـ{selectedLabel}.
        </div>
      ) : (
        <div className="space-y-6">
          {gpGroups.map((gpGroup) => (
            <div key={gpGroup.gpValue} className="space-y-3">
              <div className="card border-r-4 border-gov p-3">
                <h2 className="text-base font-bold text-gov-dark">
                  نقطة التجمّع: {gpGroup.gpLabel}
                </h2>
              </div>

              {gpGroup.smallFarmers.length > 0 && (() => {
                const groupKey = `${selectedType}_${gpGroup.gpValue}_SMALL`;
                const assignedId = assignmentMap.get(groupKey) ?? null;
                const assignedName = assignedId ? supervisorMap.get(assignedId) : undefined;
                return (
                  <div className="card overflow-hidden p-0">
                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">
                          مجموعة المربّين (حتى {HEAD_THRESHOLD} رأس)
                        </span>
                        <span className="text-xs text-gray-500">
                          {gpGroup.smallFarmers.length} مربّي
                        </span>
                        {assignedName && (
                          <span className="rounded-full bg-gov-light px-2 py-0.5 text-xs font-semibold text-gov-dark">
                            {assignedName}
                          </span>
                        )}
                      </div>
                      <AssignControl
                        animalType={selectedType}
                        gatheringPoint={gpGroup.gpValue}
                        groupType="SMALL"
                        supervisors={supervisors}
                        currentSupervisorId={assignedId}
                      />
                    </div>
                    <FarmerTable rows={gpGroup.smallFarmers} selectedType={selectedType} />
                  </div>
                );
              })()}

              {gpGroup.largeFarmers.map((row) => {
                const groupKey = `${selectedType}_${gpGroup.gpValue}_SOLO_${row.declarationId}`;
                const assignedId = assignmentMap.get(groupKey) ?? null;
                const assignedName = assignedId ? supervisorMap.get(assignedId) : undefined;
                return (
                  <div key={row.declarationId} className="card overflow-hidden p-0">
                    <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-amber-800">
                          مربّي مفرد: {row.name}
                        </span>
                        <span className="text-xs font-semibold text-amber-700">
                          {row.totalChipped} رأس
                        </span>
                        {assignedName && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            {assignedName}
                          </span>
                        )}
                      </div>
                      <AssignControl
                        animalType={selectedType}
                        gatheringPoint={gpGroup.gpValue}
                        groupType="SOLO"
                        soloDeclarationId={row.declarationId}
                        supervisors={supervisors}
                        currentSupervisorId={assignedId}
                      />
                    </div>
                    <FarmerTable rows={[row]} selectedType={selectedType} />
                  </div>
                );
              })}
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
