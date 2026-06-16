// Post-submit confirmation page showing the transaction number to keep for field audit.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { IconCheckCircle } from "@/components/icons";

export const dynamic = "force-dynamic";

// Confirmation page after submitting or updating a declaration; surfaces the transaction number.
export default async function SuccessPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { updated?: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const decl = await prisma.declaration.findUnique({ where: { id } });
  if (!decl) notFound();

  const isUpdated = !!searchParams.updated;

  return (
    <div className="space-y-5">
      <div className="card text-center">
        <IconCheckCircle className="mx-auto h-14 w-14 text-gov" />
        <h1 className="mt-2 text-xl font-bold text-gov-dark">
          {isUpdated ? "تم تحديث الإقرار بنجاح" : "تم استلام الإقرار بنجاح"}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          يرجى الاحتفاظ برقم المعاملة التالي لاستخدامه أثناء التدقيق الميداني:
        </p>
        <div className="mt-4 inline-block rounded-xl border-2 border-dashed border-gov bg-gov-light px-8 py-4">
          <div className="text-xs text-gray-600">رقم المعاملة</div>
          <div className="text-3xl font-extrabold tracking-wider text-gov-dark">
            {decl.id}
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          المُقرّ: {decl.name} - الرقم المدني: {decl.civilId}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/farmer" className="btn-secondary">
          إقرار مربّي آخر
        </Link>
        <Link href="/" className="btn-secondary">
          الرئيسية
        </Link>
      </div>
    </div>
  );
}
