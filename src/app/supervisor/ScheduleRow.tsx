"use client";

import { useRouter } from "next/navigation";

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
