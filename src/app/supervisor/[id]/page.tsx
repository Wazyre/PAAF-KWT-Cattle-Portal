import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { findProximityHits } from "@/lib/proximity";
import DeclarationView from "@/components/DeclarationView";
import { IconCheckCircle, IconAlertTriangle } from "@/components/icons";
import { GATHERING_POINTS, ANIMAL_TYPES, animalTypeLabel } from "@/lib/constants";
import AuditForm from "./AuditForm";

export const dynamic = "force-dynamic";

function formatDateTime(d: Date): string {
  return new Date(d).toISOString().replace("T", " ").slice(0, 19);
}

function gpLabel(value: string): string {
  return GATHERING_POINTS.find((g) => g.value === value)?.label ?? value;
}

function atLabel(value: string): string {
  return ANIMAL_TYPES.find((a) => a.value === value)?.label ?? value;
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
  if (!Number.isInteger(id)) {
    return <NotFoundCard />;
  }

  const decl = await prisma.declaration.findUnique({
    where: { id },
    include: {
      animalGroups: { include: { locations: true } },
      audit: {
        include: {
          animalResults: {
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
        .filter((r) => r.flaggedSymbol || r.flaggedProximity)
        .map((r) => r.rawChip)
    )
  );

  const allAnimalTypes = [...new Set(decl.animalGroups.map((g) => g.animalType))];
  const requestedType = searchParams.animalType;
  const animalTypes = (
    requestedType && allAnimalTypes.includes(requestedType as typeof allAnimalTypes[number])
      ? [requestedType as typeof allAnimalTypes[number]]
      : allAnimalTypes
  ).map((type) => ({ type, label: animalTypeLabel(type) }));

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
              تنبيه: يوجد مربّون آخرون على بُعد 5 أمتار أو أقل من موقع هذا
              المربّي
            </span>
          </div>
          <ul className="space-y-1 text-sm">
            {hits.map((h, i) => (
              <li key={i}>
                الموقع رقم {h.thisLocationIndex + 1} (
                {h.thisLat.toFixed(6)}, {h.thisLng.toFixed(6)}) يبعد{" "}
                {h.distance.toFixed(2)} م عن المربّي{" "}
                <strong>{h.otherName}</strong> — الرقم المدني{" "}
                <strong>{h.otherCivilId}</strong> (معاملة {h.otherDeclarationId})
                — موقعه ({h.otherLat.toFixed(6)}, {h.otherLng.toFixed(6)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <DeclarationView decl={decl} />

      {audit && offending.length > 0 && (
        <div className="warn-box space-y-1">
          <div className="font-bold">
            تحذير: أرقام شرائح مخالفة ({offending.length})
          </div>
          <div className="text-sm">
            وُجد رمز/نجمة بجانب الرقم، أو قراءتان بفارق 5 ثوانٍ أو أقل:
          </div>
          <div className="text-sm font-mono break-all">
            {offending.join(" ، ")}
          </div>
        </div>
      )}

      {audit && audit.animalResults.length > 0 && (
        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-gov-dark">
            قراءات الشرائح المحفوظة
          </h2>
          {audit.animalResults.map((ar) => (
            <div key={ar.id} className="space-y-2">
              <h3 className="font-semibold text-gov-dark">
                {atLabel(ar.animalType)} ({ar.readings.length} قراءة)
              </h3>
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
              {ar.readings.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gov-light text-gov-dark">
                        <th className="border border-gray-300 px-2 py-1">#</th>
                        <th className="border border-gray-300 px-2 py-1">
                          وقت القراءة
                        </th>
                        <th className="border border-gray-300 px-2 py-1">
                          رقم الشريحة
                        </th>
                        <th className="border border-gray-300 px-2 py-1">
                          ملاحظات
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ar.readings.map((r, i) => (
                        <tr
                          key={r.id}
                          className={
                            r.flaggedSymbol || r.flaggedProximity
                              ? "bg-amber-50 text-center"
                              : "text-center"
                          }
                        >
                          <td className="border border-gray-300 px-2 py-1">
                            {i + 1}
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            {formatDateTime(new Date(r.readAt))}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 font-mono">
                            {r.rawChip}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-xs">
                            {[
                              r.flaggedSymbol ? "رمز/نجمة" : "",
                              r.flaggedProximity ? "تقارب زمني ≤ 5 ث" : ""
                            ]
                              .filter(Boolean)
                              .join(" + ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AuditForm
        declarationId={decl.id}
        animalTypes={animalTypes}
        animalTypeFilter={requestedType}
        defaults={
          audit
            ? {
                animalResults: Object.fromEntries(
                  audit.animalResults.map((r) => [
                    r.animalType,
                    {
                      violationStatus: r.violationStatus,
                      differenceReasons: r.differenceReasons as string[],
                      locationLink: r.locationLink,
                      readingCount: r.readings.length
                    }
                  ])
                )
              }
            : undefined
        }
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
                (sum, g) =>
                  sum + g.locations.reduce((s, l) => s + l.chippedCount, 0),
                0
              );
              const totalLocs = groups.reduce(
                (sum, g) => sum + g.locations.length,
                0
              );
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
