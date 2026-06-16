// Print-friendly audit report: declaration, proximity alerts, audit results, and signature lines.
import { prisma } from "@/lib/prisma";
import { findProximityHits } from "@/lib/proximity";
import DeclarationView from "@/components/DeclarationView";
import PrintButton from "@/components/PrintButton";
import {
  violationStatusLabel,
  differenceReasonLabel,
  animalTypeLabel,
  ANIMAL_TYPES
} from "@/lib/constants";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<string>(ANIMAL_TYPES.map((a) => a.value));

// Print-ready audit report: declaration view, proximity alerts, per-site audit results, and signature lines.
export default async function PrintPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { animalType?: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return <div className="danger-box">معاملة غير صالحة.</div>;
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
      }
    }
  });
  if (!decl) {
    return <div className="danger-box">المعاملة غير موجودة.</div>;
  }

  const rawAnimalType = searchParams.animalType ?? "";
  const animalTypeFilter =
    VALID_TYPES.has(rawAnimalType) ? rawAnimalType : null;

  const audit = decl.audit
    ? {
        ...decl.audit,
        animalResults: animalTypeFilter
          ? decl.audit.animalResults.filter(
              (r) => r.animalType === animalTypeFilter
            )
          : decl.audit.animalResults
      }
    : null;

  const hits = await findProximityHits(id);

  const allReadings = audit?.animalResults.flatMap((r) => r.readings) ?? [];
  const offending = Array.from(
    new Set(
      allReadings
        .filter((r) => r.flaggedSymbol || r.flaggedProximity)
        .map((r) => r.rawChip)
    )
  );

  const fmt = (d: Date) =>
    new Date(d).toISOString().replace("T", " ").slice(0, 19);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold text-gov-dark">
          نسخة الطباعة — معاملة {decl.id}
        </h1>
        <PrintButton />
      </div>

      <div className="card text-center">
        <div className="text-lg font-bold text-gov-dark">
          الهيئة العامة لشئون الزراعة والثروة السمكية — دولة الكويت
        </div>
        <div className="text-sm text-gray-600">
          محضر تدقيق ميداني — معاملة رقم {decl.id}
          {animalTypeFilter && (
            <span> — {animalTypeLabel(animalTypeFilter)}</span>
          )}
        </div>
      </div>

      <DeclarationView decl={decl} />

      {hits.length > 0 && (
        <div className="danger-box space-y-1">
          <div className="font-bold">تنبيه تقارب المواقع (≤ 5 أمتار):</div>
          <ul className="space-y-1 text-sm">
            {hits.map((h, i) => (
              <li key={i}>
                الموقع {h.thisLocationIndex + 1} يبعد {h.distance.toFixed(2)} م
                عن {h.otherName} (مدني {h.otherCivilId} — معاملة{" "}
                {h.otherDeclarationId})
              </li>
            ))}
          </ul>
        </div>
      )}

      {audit ? (
        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-gov-dark">نتيجة التدقيق</h2>

          {offending.length > 0 && (
            <div className="warn-box text-sm">
              <div className="font-bold">
                أرقام شرائح مخالفة ({offending.length}):
              </div>
              <div className="font-mono break-all">{offending.join(" ، ")}</div>
            </div>
          )}

          {audit.animalResults.map((ar) => {
            const reasons = (ar.differenceReasons as string[])
              .map(differenceReasonLabel)
              .filter(Boolean)
              .join("، ");
            const gp = decl.animalGroups
              .find((g) => g.animalType === ar.animalType)
              ?.locations[ar.siteIndex]?.gatheringPoint;
            const siteSuffix = gp
              ? ` — الموقع ${ar.siteIndex + 1}`
              : ar.siteIndex > 0
              ? ` — الموقع ${ar.siteIndex + 1}`
              : "";

            return (
              <div key={ar.id} className="space-y-2">
                <h3 className="font-semibold text-gov-dark">
                  {animalTypeLabel(ar.animalType)}{siteSuffix}
                </h3>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-gray-500">حالة المخالفة</div>
                    <div className="font-semibold">
                      {violationStatusLabel(ar.violationStatus)}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs text-gray-500">أسباب الاختلاف</div>
                    <div className="font-semibold">{reasons || "—"}</div>
                  </div>
                  {ar.latitude !== null && ar.longitude !== null && (
                    <div>
                      <div className="text-xs text-gray-500">موقع القراءة</div>
                      <div className="font-semibold text-xs">
                        {ar.latitude.toFixed(6)}, {ar.longitude.toFixed(6)}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-gray-500">إجمالي القراءات</div>
                    <div className="font-semibold">{ar.readings.length}</div>
                  </div>
                </div>

                {ar.readings.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-gov-light text-gov-dark">
                          <th className="border border-gray-400 px-2 py-1">#</th>
                          <th className="border border-gray-400 px-2 py-1">
                            وقت القراءة
                          </th>
                          <th className="border border-gray-400 px-2 py-1">
                            رقم الشريحة
                          </th>
                          <th className="border border-gray-400 px-2 py-1">
                            ملاحظات
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ar.readings.map((r, i) => (
                          <tr key={r.id} className="text-center">
                            <td className="border border-gray-400 px-2 py-1">
                              {i + 1}
                            </td>
                            <td className="border border-gray-400 px-2 py-1">
                              {fmt(r.readAt)}
                            </td>
                            <td className="border border-gray-400 px-2 py-1 font-mono">
                              {r.rawChip}
                            </td>
                            <td className="border border-gray-400 px-2 py-1">
                              {[
                                r.flaggedSymbol ? "رمز/نجمة" : "",
                                r.flaggedProximity ? "تقارب ≤ 5ث" : "",
                                r.flaggedMultipleChips ? "أكثر من شريحة" : "",
                                r.flaggedDoesntBelong ? "ليست باسم المربي" : ""
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
            );
          })}

          <div className="grid grid-cols-2 gap-8 pt-8 text-sm">
            <div>توقيع مشرف الفريق: ............................</div>
            <div>توقيع المربّي: ............................</div>
          </div>
        </div>
      ) : (
        <div className="warn-box">
          لم يتم إدخال بيانات التدقيق لهذه المعاملة بعد.
        </div>
      )}
    </div>
  );
}
