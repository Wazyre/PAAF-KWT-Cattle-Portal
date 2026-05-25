import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import "./globals.css";

const AUTHORITY_NAME = "الهيئة العامة لشئون الزراعة والثروة السمكية";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-arabic",
  display: "swap"
});

export const metadata: Metadata = {
  title: "بوابة حصر وتدقيق المواشي",
  description: `بوابة الإقرار الذاتي وتدقيق أعداد المواشي - ${AUTHORITY_NAME} - دولة الكويت`
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
              <BrandLogo className="h-20 w-20" />
              <div className="leading-tight">
                <div className="text-base font-bold">
                المنصة الإلكترونية لحصر ومراجعة بيانات الثروة الحيوانية في دولة الكويت
                </div>
                <div className="text-xs text-white/80">{AUTHORITY_NAME}</div>
              </div>
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
        <footer className="no-print mx-auto max-w-4xl px-4 pb-8 pt-4 text-center text-xs leading-relaxed text-gray-500">
          <div>{AUTHORITY_NAME} — دولة الكويت</div>
          <div>جميع الحقوق محفوظة © {new Date().getFullYear()}</div>
        </footer>
      </body>
    </html>
  );
}
