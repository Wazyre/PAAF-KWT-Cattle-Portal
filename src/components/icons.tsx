// Inline SVG icon components used across the portal (clipboard, calendar, clock, check, warning).
import type { SVGProps } from "react";

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24"
};

/** Clipboard with a pencil — farmer self-declaration. */
export function IconClipboardEdit(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M16 5h2a1 1 0 0 1 1 1v6" />
      <path d="M12 20H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2" />
      <path d="M20.4 14.6a1.5 1.5 0 0 1 0 2.1l-4.2 4.2L13 22l1.1-3.2 4.2-4.2a1.5 1.5 0 0 1 2.1 0Z" />
    </svg>
  );
}

/** Clipboard with a check — field audit. */
export function IconClipboardCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M16 5h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  );
}

/** Circle with a check — success. */
export function IconCheckCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

/** Calendar — date picker trigger. */
export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9h17" />
      <path d="M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

/** Clock — time picker trigger. */
export function IconClock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Triangle with exclamation — warnings. */
export function IconAlertTriangle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M10.3 4.3 2.8 17a1.6 1.6 0 0 0 1.4 2.4h15.6A1.6 1.6 0 0 0 21.2 17L13.7 4.3a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9v4" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}
