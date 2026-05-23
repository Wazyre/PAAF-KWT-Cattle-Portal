import { prisma } from "@/lib/prisma";
import { findProximityHits } from "@/lib/proximity";
import DeclarationView from "@/components/DeclarationView";
import PrintButton from "@/components/PrintButton";
import {
  violationStatusLabel,
  differenceReasonLabel
} from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PrintPage({
  params
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return <div className="danger-box">معاملة غير صالحة.</div>;
  }
  const decl = await prisma.declaration.findUnique({
    where: { id },
    include: {
      locations: { include: { animals: true } },
      audit: { include: { readings: { orderBy: { readAt: "asc" } } } }
    }
  });
  if (!decl) {
    return <div className="danger-box">المعاملة غير موجودة.</div>;
  }

  const audit = decl.audit;
  const hits = await findProximityHits(id);
  const offending = audit
    ? Array.from(
        new Set(
          audit.readings
            .filter((r) => r.flaggedSymbol || r.flaggedProximity)
            .map((r) => r.rawChip)
        )
      )
    : [];

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
        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-gov-dark">نتيجة التدقيق</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-gray-500">بداية قراءة الشرائح</div>
              <div className="font-semibold">
                {fmt(audit.chipReadStart)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">نهاية قراءة الشرائح</div>
              <div className="font-semibold">{fmt(audit.chipReadEnd)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">حالة المخالفة</div>
              <div className="font-semibold">
                {violationStatusLabel(audit.violationStatus)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">سبب الاختلاف</div>
              <div className="font-semibold">
                {differenceReasonLabel(audit.differenceReason) || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">
                إجمالي القراءات المحفوظة
              </div>
              <div className="font-semibold">{audit.readings.length}</div>
            </div>
          </div>

          {offending.length > 0 && (
            <div className="warn-box text-sm">
              <div className="font-bold">
                أرقام شرائح مخالفة ({offending.length}):
              </div>
              <div className="font-mono break-all">
                {offending.join(" ، ")}
              </div>
            </div>
          )}

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
                  <th className="border border-gray-400 px-2 py-1">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {audit.readings.map((r, i) => (
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
                        r.flaggedProximity ? "تقارب ≤ 5ث" : ""
                      ]
                        .filter(Boolean)
                        .join(" + ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
