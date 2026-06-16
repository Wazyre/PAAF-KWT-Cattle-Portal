"use client";
// Clickable schedule table row: navigates to the audit page for the declaration on click.

import { useRouter } from "next/navigation";

// Clickable schedule table row that navigates to the given href via the router.
export default function ScheduleRow({
  href,
  children
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer hover:bg-gov-light transition-colors"
      onClick={() => router.push(href)}
    >
      {children}
    </tr>
  );
}
