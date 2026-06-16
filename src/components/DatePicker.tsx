"use client";
// Arabic calendar date picker: displays DD-MM-YYYY but submits canonical ISO YYYY-MM-DD via a hidden input.

import { useEffect, useRef, useState } from "react";
import { IconCalendar } from "./icons";

const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر"
];
const WEEKDAYS_AR = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** ISO "YYYY-MM-DD" -> display "DD-MM-YYYY". */
function formatDisplay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/**
 * Calendar date picker. Displays the date as DD-MM-YYYY but keeps the canonical
 * ISO value (YYYY-MM-DD) in a hidden input named `name`, so server-side date
 * math and chip-reading comparisons stay unambiguous.
 */
export default function DatePicker({
  name,
  defaultValue = "",
  id
}: {
  name: string;
  defaultValue?: string;
  id?: string;
}) {
  const [selected, setSelected] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const init = defaultValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const today = new Date();
  const [view, setView] = useState({
    year: init ? +init[1] : today.getFullYear(),
    month: init ? +init[2] - 1 : today.getMonth()
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  function prevMonth() {
    setView((v) =>
      v.month === 0
        ? { year: v.year - 1, month: 11 }
        : { year: v.year, month: v.month - 1 }
    );
  }
  function nextMonth() {
    setView((v) =>
      v.month === 11
        ? { year: v.year + 1, month: 0 }
        : { year: v.year, month: v.month + 1 }
    );
  }
  function pick(day: number) {
    setSelected(toISO(view.year, view.month, day));
    setOpen(false);
  }

  const selParts = selected.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className="field-input flex w-full items-center justify-between text-right"
      >
        <span className={selected ? "" : "text-gray-400"}>
          {selected ? formatDisplay(selected) : "يوم-شهر-سنة"}
        </span>
        <IconCalendar className="h-5 w-5 shrink-0 text-gov" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-lg border border-gray-300 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={nextMonth}
              className="grid h-7 w-7 place-items-center rounded hover:bg-gov-light"
              aria-label="الشهر التالي"
            >
              ›
            </button>
            <div className="text-sm font-bold text-gov-dark">
              {MONTHS_AR[view.month]} {view.year}
            </div>
            <button
              type="button"
              onClick={prevMonth}
              className="grid h-7 w-7 place-items-center rounded hover:bg-gov-light"
              aria-label="الشهر السابق"
            >
              ‹
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
            {WEEKDAYS_AR.map((w) => (
              <div key={w} className="py-1 font-semibold">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {cells.map((day, i) => {
              if (day === null) return <div key={`b${i}`} />;
              const isSel =
                !!selParts &&
                +selParts[1] === view.year &&
                +selParts[2] - 1 === view.month &&
                +selParts[3] === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  className={`rounded py-1 transition ${
                    isSel
                      ? "bg-gov font-bold text-white"
                      : "hover:bg-gov-light"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={() => {
                setSelected("");
                setOpen(false);
              }}
              className="text-xs font-semibold text-red-600"
            >
              مسح
            </button>
            <button
              type="button"
              onClick={() => {
                const n = new Date();
                setView({ year: n.getFullYear(), month: n.getMonth() });
                setSelected(toISO(n.getFullYear(), n.getMonth(), n.getDate()));
                setOpen(false);
              }}
              className="text-xs font-semibold text-gov"
            >
              اليوم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
