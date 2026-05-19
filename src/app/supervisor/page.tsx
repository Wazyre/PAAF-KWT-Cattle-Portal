import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SupervisorIndex({
  searchParams
}: {
  searchParams: { t?: string };
}) {
  const t = (searchParams.t ?? "").trim();
  if (t && /^\d+$/.test(t)) {
    redirect(`/supervisor/${t}`);
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <h1 className="text-xl font-bold text-gov-dark">
          تدقيق الفرق الميدانية
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          أدخل رقم المعاملة المراد تدقيقها لعرض الإقرار وبدء عملية التدقيق.
        </p>
      </div>

      <form method="get" className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="t">
            رقم المعاملة
          </label>
          <input
            id="t"
            name="t"
            inputMode="numeric"
            className="field-input"
            placeholder="مثال: 1"
            defaultValue={t}
            required
          />
        </div>
        {t && (
          <div className="danger-box">رقم المعاملة غير صالح.</div>
        )}
        <button type="submit" className="btn-primary">
          عرض الإقرار
        </button>
      </form>

      <Link href="/" className="text-sm font-semibold text-gov">
        ← العودة للرئيسية
      </Link>
    </div>
  );
}
