import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { findProximityHits } from "@/lib/proximity";
import DeclarationView from "@/components/DeclarationView";
import { IconCheckCircle, IconAlertTriangle } from "@/components/icons";
import { GATHERING_POINTS, ANIMAL_TYPES, animalTypeLabel } from "@/lib/constants";
import AuditForm from "./AuditForm";
import ChipFlagsTable from "./ChipFlagsTable";

export const dynamic = "force-dynamic";

function gpLabel(value: string): string {
  return GATHERING_POINTS.find((g) => g.value === value)?.label ?? value;
}

function atLabel(value: string): string {
  return ANIMAL_TYPES.find((a) => a.value === value)?.label ?? value;
}

function fmtDate(d: Date): string {
  return new Date(d).toISOString().replace("T", " ").slice(0, 19);
}

interface AnimalGroupSnapshot {
  animalType: string;
  locations: Array<{
    gatheringPoint: string;
    latitude: number;
    longitude: number;
    chippedCount: number;
    males: number;
    females: number;
    numTenders: number;
  }>;
}

export default async function AuditPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { saved?: string; animalType?: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return <NotFoundCard />;

  const decl = await prisma.declaration.findUnique({
    where: { id },
    include: {
      animalGroups: { include: { locations: true } },
      audit: {
        include: {
          animalResults: {
            orderBy: [{ animalType: "asc" }, { siteIndex: "asc" }],
            include: { readings: { orderBy: { readAt: "asc" } } }
          }
        }
      },
      revisions: { orderBy: { revisedAt: "desc" } }
    }
  });
  if (!decl) return <NotFoundCard />;

  const hits = await findProximityHits(id);
  const audit = decl.audit;

  const allReadings = audit?.animalResults.flatMap((r) => r.readings) ?? [];
  const offending = Array.from(
    new Set(
      allReadings
        .filter(
          (r) =>
            r.flaggedSymbol ||
            r.flaggedProximity ||
            r.flaggedMultipleChips ||
            r.flaggedDoesntBelong
        )
        .map((r) => r.rawChip)
    )
  );

  const requestedType = searchParams.animalType;
  const allAnimalTypes = [...new Set(decl.animalGroups.map((g) => g.animalType))];

  // Build animalTypes with per-site info for AuditForm
  const animalTypes = allAnimalTypes
    .filter((type) => !requestedType || requestedType === type)
    .map((type) => {
      const group = decl.animalGroups.find((g) => g.animalType === type)!;
      return {
        type,
        label: animalTypeLabel(type),
        sites: group.locations.map((loc, siteIndex) => ({
          siteIndex,
          gatheringPointLabel: gpLabel(loc.gatheringPoint)
        }))
      };
    });

  // Build defaults indexed by [type][siteIndex]
  const defaults = audit
    ? {
        animalResults: Object.fromEntries(
          allAnimalTypes.map((type) => {
            const group = decl.animalGroups.find((g) => g.animalType === type)!;
            return [
              type,
              group.locations.map((_, siteIndex) => {
                const result = audit.animalResults.find(
                  (r) => r.animalType === type && r.siteIndex === siteIndex
                );
                if (!result) return undefined;
                return {
                  violationStatus: result.violationStatus,
                  differenceReasons: result.differenceReasons as string[],
                  locationLink: result.locationLink,
                  readingCount: result.readings.length
                };
              })
            ];
          })
        )
      }
    : undefined;

  // Audit results to show (filtered by type if requested)
  const visibleResults = audit?.animalResults.filter(
    (r) => !requestedType || r.animalType === requestedType
  ) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gov-dark">
          تدقيق المعاملة رقم {decl.id}
        </h1>
        <Link href="/supervisor" className="text-sm font-semibold text-gov no-print">
          تدقيق معاملة أخرى
        </Link>
      </div>

      {searchParams.saved && (
        <div className="flex items-center gap-2 rounded-lg border border-green-400 bg-green-50 p-4 text-green-900">
          <IconCheckCircle className="h-5 w-5 shrink-0" />
          <span>تم حفظ بيانات التدقيق بنجاح.</span>
        </div>
      )}

      {hits.length > 0 && (
        <div className="danger-box space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <IconAlertTriangle className="h-5 w-5 shrink-0" />
            <span>
              تنبيه: يوجد مربّون آخرون على بُعد 5 أمتار أو أقل من موقع هذا المربّي
            </span>
          </div>
          <ul className="space-y-1 text-sm">
            {hits.map((h, i) => (
              <li key={i}>
                الموقع رقم {h.thisLocationIndex + 1} ({h.thisLat.toFixed(6)},{" "}
                {h.thisLng.toFixed(6)}) يبعد {h.distance.toFixed(2)} م عن المربّي{" "}
                <strong>{h.otherName}</strong> — الرقم المدني{" "}
                <strong>{h.otherCivilId}</strong> (معاملة {h.otherDeclarationId}) — موقعه (
                {h.otherLat.toFixed(6)}, {h.otherLng.toFixed(6)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <DeclarationView decl={decl} />

      {audit && offending.length > 0 && (
        <div className="warn-box space-y-1">
          <div className="font-bold">تحذير: أرقام شرائح تستوجب المراجعة ({offending.length})</div>
          <div className="text-sm">
            وُجد رمز/نجمة، أو تقارب زمني ≤ 5 ثوانٍ، أو مُصنَّف كـ"أكثر من شريحة / ليست باسم المربي":
          </div>
          <div className="text-sm font-mono break-all">{offending.join(" ، ")}</div>
        </div>
      )}

      {visibleResults.length > 0 && (
        <div className="card space-y-6">
          <h2 className="text-lg font-bold text-gov-dark">قراءات الشرائح المحفوظة</h2>
          {visibleResults.map((ar) => {
            const label = `${atLabel(ar.animalType)} — ${
              decl.animalGroups
                .find((g) => g.animalType === ar.animalType)
                ?.locations[ar.siteIndex]
                ? gpLabel(
                    decl.animalGroups.find((g) => g.animalType === ar.animalType)!
                      .locations[ar.siteIndex].gatheringPoint
                  )
                : `الموقع ${ar.siteIndex + 1}`
            }`;
            return (
              <div key={ar.id} className="space-y-2">
                {ar.latitude !== null && ar.longitude !== null && (
                  <p className="text-xs text-gray-500">
                    موقع القراءة:{" "}
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${ar.latitude}&mlon=${ar.longitude}#map=17/${ar.latitude}/${ar.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-gov hover:underline"
                    >
                      {ar.latitude.toFixed(6)}, {ar.longitude.toFixed(6)} ↗
                    </a>
                  </p>
                )}
                {ar.readings.length > 0 ? (
                  <ChipFlagsTable
                    resultId={ar.id}
                    label={label}
                    readings={ar.readings.map((r) => ({
                      id: r.id,
                      rawChip: r.rawChip,
                      readAt: fmtDate(r.readAt),
                      flaggedSymbol: r.flaggedSymbol,
                      flaggedProximity: r.flaggedProximity,
                      flaggedMultipleChips: r.flaggedMultipleChips,
                      flaggedDoesntBelong: r.flaggedDoesntBelong
                    }))}
                  />
                ) : (
                  <p className="text-sm text-gray-500">{label} — لا توجد قراءات محفوظة.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AuditForm
        declarationId={decl.id}
        animalTypes={animalTypes}
        animalTypeFilter={requestedType}
        defaults={defaults}
      />

      {decl.revisions.length > 0 && (
        <div className="card space-y-3 no-print">
          <h2 className="text-lg font-bold text-gov-dark">
            سجل التغييرات ({decl.revisions.length})
          </h2>
          <p className="text-sm text-gray-500">
            كل إدخال يمثّل النسخة السابقة من الإقرار قبل آخر تعديل.
          </p>
          <div className="space-y-2">
            {decl.revisions.map((rev, idx) => {
              const groups = rev.locations as unknown as AnimalGroupSnapshot[];
              const totalAnimals = groups.reduce(
                (sum, g) => sum + g.locations.reduce((s, l) => s + l.chippedCount, 0),
                0
              );
              const totalLocs = groups.reduce((sum, g) => sum + g.locations.length, 0);
              return (
                <details
                  key={rev.id}
                  className="rounded-lg border border-gray-200 bg-gray-50"
                >
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gov-dark">
                    النسخة {decl.revisions.length - idx} — تعديل بتاريخ{" "}
                    {new Date(rev.revisedAt).toISOString().replace("T", " ").slice(0, 16)} —
                    هاتف: {rev.mobile} — {totalLocs} موقع / {totalAnimals} حيوان
                  </summary>
                  <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-3">
                    {groups.map((grp, gi) => (
                      <div key={gi} className="space-y-2">
                        <div className="text-sm font-semibold text-gov-dark">
                          {atLabel(grp.animalType)}
                        </div>
                        {grp.locations.map((loc, li) => (
                          <div key={li} className="space-y-1">
                            {grp.locations.length > 1 && (
                              <div className="text-xs text-gray-600 font-medium">
                                الموقع {li + 1}
                              </div>
                            )}
                            <div className="text-xs text-gray-500">
                              {gpLabel(loc.gatheringPoint)} —{" "}
                              {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-xs">
                                <thead>
                                  <tr className="bg-gov-light text-gov-dark">
                                    <th className="border border-gray-300 px-2 py-1">مُرقّم</th>
                                    <th className="border border-gray-300 px-2 py-1">ذكور</th>
                                    <th className="border border-gray-300 px-2 py-1">إناث</th>
                                    <th className="border border-gray-300 px-2 py-1">عمال/رعاة</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-center">
                                    <td className="border border-gray-300 px-2 py-1">{loc.chippedCount}</td>
                                    <td className="border border-gray-300 px-2 py-1">{loc.males}</td>
                                    <td className="border border-gray-300 px-2 py-1">{loc.females}</td>
                                    <td className="border border-gray-300 px-2 py-1">{loc.numTenders}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NotFoundCard() {
  return (
    <div className="space-y-4">
      <div className="danger-box">
        لم يتم العثور على معاملة بهذا الرقم. تأكّد من رقم المعاملة.
      </div>
      <Link href="/supervisor" className="btn-secondary">
        رجوع
      </Link>
    </div>
  );
}
