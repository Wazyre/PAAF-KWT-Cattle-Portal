import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-arabic",
  display: "swap"
});

export const metadata: Metadata = {
  title: "بوابة حصر وتدقيق الأغنام والماعز",
  description:
    "بوابة حكومية للإقرار الذاتي وتدقيق أعداد الأغنام والماعز - دولة الكويت"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen font-sans antialiased">
        <header className="no-print border-b border-gov-dark bg-gov text-white">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-xl">
                🐑
              </span>
              <div className="leading-tight">
                <div className="text-base font-bold">
                  بوابة حصر وتدقيق الأغنام والماعز
                </div>
                <div className="text-xs text-white/80">دولة الكويت</div>
              </div>
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
        <footer className="no-print mx-auto max-w-4xl px-4 pb-8 pt-4 text-center text-xs text-gray-500">
          جميع الحقوق محفوظة © دولة الكويت
        </footer>
      </body>
    </html>
  );
}
