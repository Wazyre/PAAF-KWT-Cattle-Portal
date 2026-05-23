import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { findProximityHits } from "@/lib/proximity";
import DeclarationView from "@/components/DeclarationView";
import { IconCheckCircle, IconAlertTriangle } from "@/components/icons";
import AuditForm from "./AuditForm";

export const dynamic = "force-dynamic";

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(
    d.getUTCDate()
  )}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export default async function AuditPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return <NotFoundCard />;
  }

  const decl = await prisma.declaration.findUnique({
    where: { id },
    include: {
      locations: { include: { animals: true } },
      audit: { include: { readings: { orderBy: { readAt: "asc" } } } }
    }
  });
  if (!decl) return <NotFoundCard />;

  const hits = await findProximityHits(id);
  const audit = decl.audit;
  const offending = audit
    ? Array.from(
        new Set(
          audit.readings
            .filter((r) => r.flaggedSymbol || r.flaggedProximity)
            .map((r) => r.rawChip)
        )
      )
    : [];

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

      {audit && (
        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-gov-dark">
            قراءات الشرائح المحفوظة ({audit.readings.length})
          </h2>
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
                  <th className="border border-gray-300 px-2 py-1">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {audit.readings.map((r, i) => (
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
                      {new Date(r.readAt).toISOString().replace("T", " ").slice(0, 19)}
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
        </div>
      )}

      <AuditForm
        declarationId={decl.id}
        defaults={
          audit
            ? {
                chipReadStart: toLocalInput(new Date(audit.chipReadStart)),
                chipReadEnd: toLocalInput(new Date(audit.chipReadEnd)),
                violationStatus: audit.violationStatus,
                differenceReason: audit.differenceReason
              }
            : undefined
        }
      />
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
