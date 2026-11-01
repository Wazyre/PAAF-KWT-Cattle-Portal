// Farmer portal: renders DeclarationForm for the signed-in farmer, prefilled with any existing declaration.
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { resolveIdentity } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { isFeatureAllowed } from "@/lib/access";
import DeclarationForm from "./DeclarationForm";
import LegalGate from "./LegalGate";

export const dynamic = "force-dynamic";

// Farmer portal: the signed-in farmer's declaration form, prefilled with any existing declaration.
export default async function FarmerPage() {
  const session = await requireRole("FARMER");
  const identity = await resolveIdentity(session.civilId);
  if (!identity) redirect("/?reason=denied");

  const existing = await prisma.declaration.findUnique({
    where: { civilId: identity.civilId },
    include: { animalGroups: { include: { locations: true } } }
  });

  // Registration / update switches (see `npm run access`): show a notice instead of the form.
  const allowed = await isFeatureAllowed(
    existing ? "UPDATES" : "REGISTRATION",
    identity.civilId
  );
  if (!allowed) {
    return (
      <div className="space-y-5">
        <div className="card">
          <h1 className="text-xl font-bold text-gov-dark">
            الإقرار الذاتي لمربّي المواشي
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {existing
              ? "تعديل الإقرارات غير متاح حالياً لهذا الرقم المدني."
              : "التسجيل الجديد غير متاح حالياً لهذا الرقم المدني."}
          </p>
          {existing && (
            <p className="mt-2 text-sm text-gray-600">
              رقم المعاملة المسجّلة:{" "}
              <span className="font-bold text-gov-dark">{existing.id}</span>
            </p>
          )}
        </div>
        <Link href="/" className="text-sm font-semibold text-gov">
          ← العودة للرئيسية
        </Link>
      </div>
    );
  }

  const header = (
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
  );

  const form = (
    <DeclarationForm
      civilId={identity.civilId}
      name={identity.name}
      initialData={existing}
    />
  );

  // Editors (existing declaration) skip the legal gate; first-time users must slide to confirm.
  if (existing) {
    return (
      <div className="space-y-5">
        {header}
        {form}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      <LegalGate>{form}</LegalGate>
    </div>
  );
}
