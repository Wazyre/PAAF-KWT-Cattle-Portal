// Farmer portal: Civil-ID gate, then renders DeclarationForm prefilled with any existing declaration.
import Link from "next/link";
import { resolveIdentity } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import DeclarationForm from "./DeclarationForm";

export const dynamic = "force-dynamic";

// Renders the Civil-ID gate, or the prefilled declaration form once identity is resolved.
export default async function FarmerPage({
  searchParams
}: {
  searchParams: { civilId?: string };
}) {
  const civilId = (searchParams.civilId ?? "").trim();
  const identity = civilId ? await resolveIdentity(civilId) : null;

  if (!identity) {
    return (
      <div className="space-y-5">
        <div className="card">
          <h1 className="text-xl font-bold text-gov-dark">
            الإقرار الذاتي لمربّي المواشي
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            أدخل الرقم المدني لاستيراد بياناتك تلقائياً والبدء بتعبئة الإقرار.
          </p>
        </div>

        <form method="get" className="card space-y-4">
          <div>
            <label className="field-label" htmlFor="civilId">
              الرقم المدني
            </label>
            <input
              id="civilId"
              name="civilId"
              inputMode="numeric"
              className="field-input"
              placeholder="12 رقماً"
              defaultValue={civilId}
              required
            />
          </div>
          {civilId && (
            <div className="danger-box">
              لم يتم العثور على بيانات لهذا الرقم المدني. تأكّد من الرقم
              (12 رقماً).
            </div>
          )}
          <button type="submit" className="btn-primary">
            تحقّق وابدأ الإقرار
          </button>
          <p className="text-xs text-gray-500">
            للتجربة استخدم أحد الأرقام المضافة مثل: 287010112345
          </p>
        </form>

        <Link href="/" className="text-sm font-semibold text-gov">
          ← العودة للرئيسية
        </Link>
      </div>
    );
  }

  const existing = await prisma.declaration.findUnique({
    where: { civilId: identity.civilId },
    include: { animalGroups: { include: { locations: true } } }
  });

  return (
    <div className="space-y-5">
      <div className="card">
        <h1 className="text-xl font-bold text-gov-dark">
          الإقرار الذاتي لمربّي المواشي
        </h1>
        {existing ? (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-gray-600">
              يوجد إقرار مسبق برقم المعاملة{" "}
              <span className="font-bold text-gov-dark">{existing.id}</span>.
              يمكنك مراجعة بياناتك وتعديلها.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            تم التحقق من الهوية. يرجى استكمال البيانات بدقة.
          </p>
        )}
      </div>
      <DeclarationForm
        civilId={identity.civilId}
        name={identity.name}
        initialData={existing}
      />
    </div>
  );
}
