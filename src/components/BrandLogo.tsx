"use client";
// Authority brand logo: loads /public/logo.png with an inline-SVG emblem as fallback.

import { useState } from "react";

/**
 * Renders the authority logo from /public/logo.png. If that file is not present
 * yet, it falls back to a neutral SVG emblem so the header never shows a broken
 * image. Drop the official PAAFR logo at public/logo.png to replace the fallback.
 */
export default function BrandLogo({
  className = "h-13 w-13"
}: {
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <svg
        viewBox="0 0 100 100"
        className={className}
        role="img"
        aria-label="شعار الهيئة العامة لشئون الزراعة والثروة السمكية"
      >
        <circle cx="50" cy="50" r="48" fill="#fff" stroke="#0a6b3c" strokeWidth="3" />
        <circle cx="50" cy="50" r="40" fill="#e6f2ec" />
        <path d="M44 70 V46" stroke="#7a5230" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path
          d="M44 46 C36 40 30 42 28 44 M44 46 C40 38 42 32 44 30 M44 46 C52 40 58 42 60 44 M44 46 C48 38 46 32 44 30"
          stroke="#0a6b3c"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M26 72 C34 66 44 78 52 72 C60 66 68 78 74 72"
          stroke="#3b82c4"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/logo.png"
      alt="شعار الهيئة العامة لشئون الزراعة والثروة السمكية"
      className={`${className} object-contain`}
      onError={() => setFailed(true)}
    />
  );
}
