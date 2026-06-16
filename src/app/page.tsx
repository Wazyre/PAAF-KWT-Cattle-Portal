// Landing page: three entry cards (farmer self-declaration, supervisor audit, head supervisor).
import Link from "next/link";
import { IconClipboardEdit, IconClipboardCheck, IconAlertTriangle } from "@/components/icons";

// Landing page with three portal entry cards.
export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-bold text-gov-dark">
          مرحباً بكم في بوابة حصر وتدقيق المواشي
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          يرجى اختيار الخدمة المطلوبة:
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/farmer"
          className="card flex flex-col gap-2 transition hover:border-gov hover:shadow-md"
        >
          <IconClipboardEdit className="h-9 w-9 text-gov" />
          <span className="text-lg font-bold text-gov-dark">
            الإقرار الذاتي لمربّي المواشي
          </span>
          <span className="text-sm text-gray-600">
            تعبئة نموذج الإقرار الذاتي بأعداد ومواقع الحيوانات.
          </span>
        </Link>

        <Link
          href="/supervisor"
          className="card flex flex-col gap-2 transition hover:border-gov hover:shadow-md"
        >
          <IconClipboardCheck className="h-9 w-9 text-gov" />
          <span className="text-lg font-bold text-gov-dark">
            تدقيق الفرق الميدانية
          </span>
          <span className="text-sm text-gray-600">
            مراجعة الإقرار ورفع قراءات الشرائح وتسجيل المخالفات.
          </span>
        </Link>

        <Link
          href="/head-supervisor"
          className="card flex flex-col gap-2 transition hover:border-gov hover:shadow-md"
        >
          <IconAlertTriangle className="h-9 w-9 text-gov" />
          <span className="text-lg font-bold text-gov-dark">
            بوابة رئيس المفتشين
          </span>
          <span className="text-sm text-gray-600">
            إدارة المفتشين الميدانيين وتوزيع مجموعات التدقيق عليهم.
          </span>
        </Link>
      </div>
    </div>
  );
}
