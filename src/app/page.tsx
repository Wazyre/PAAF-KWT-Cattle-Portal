import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-bold text-gov-dark">
          مرحباً بكم في بوابة حصر وتدقيق الأغنام والماعز
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          يرجى اختيار الخدمة المطلوبة:
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/farmer"
          className="card flex flex-col gap-2 transition hover:border-gov hover:shadow-md"
        >
          <span className="text-3xl">📝</span>
          <span className="text-lg font-bold text-gov-dark">
            الإقرار الذاتي لمربّي الأغنام
          </span>
          <span className="text-sm text-gray-600">
            تعبئة نموذج الإقرار الذاتي بأعداد ومواقع الحيوانات.
          </span>
        </Link>

        <Link
          href="/supervisor"
          className="card flex flex-col gap-2 transition hover:border-gov hover:shadow-md"
        >
          <span className="text-3xl">✅</span>
          <span className="text-lg font-bold text-gov-dark">
            تدقيق الفرق الميدانية
          </span>
          <span className="text-sm text-gray-600">
            مراجعة الإقرار ورفع قراءات الرقائق وتسجيل المخالفات.
          </span>
        </Link>
      </div>
    </div>
  );
}
