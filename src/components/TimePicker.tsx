"use client";
// Custom hour/minute/second picker with Arabic labels; submits canonical HH:mm:ss via a hidden input.

import { useEffect, useRef, useState } from "react";
import { IconClock } from "./icons";

// Zero-pad an integer to two digits.
const pad = (n: number) => String(n).padStart(2, "0");

// Parse an HH:mm or HH:mm:ss string into numeric parts; returns nulls if the format does not match.
function parse(value: string): {
  h: number | null;
  m: number | null;
  s: number | null;
} {
  const mt = value.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!mt) return { h: null, m: null, s: null };
  return { h: +mt[1], m: +mt[2], s: mt[3] ? +mt[3] : 0 };
}

/**
 * Time picker with a dropdown (hours / minutes / seconds columns). Keeps the
 * canonical "HH:mm:ss" value in a hidden input named `name`. Mirrors DatePicker
 * so date and time both have real pop-up pickers.
 */
export default function TimePicker({
  name,
  defaultValue = "",
  id
}: {
  name: string;
  defaultValue?: string;
  id?: string;
}) {
  const initial = parse(defaultValue);
  const [h, setH] = useState<number | null>(initial.h);
  const [m, setM] = useState<number | null>(initial.m);
  const [s, setS] = useState<number | null>(initial.s);
  const [open, setOpen] = useState(false);
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

  // Build the hidden value: emit "HH:mm:ss" once any part is chosen (unset
  // parts default to 00), otherwise empty so validation can flag it.
  const anySet = h !== null || m !== null || s !== null;
  const value = anySet ? `${pad(h ?? 0)}:${pad(m ?? 0)}:${pad(s ?? 0)}` : "";

  const cols: {
    label: string;
    range: number;
    val: number | null;
    set: (n: number) => void;
  }[] = [
    { label: "ساعة", range: 24, val: h, set: setH },
    { label: "دقيقة", range: 60, val: m, set: setM },
    { label: "ثانية", range: 60, val: s, set: setS }
  ];

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className="field-input flex w-full items-center justify-between text-right"
      >
        <span className={value ? "tabular-nums" : "text-gray-400"}>
          {value || "ساعة:دقيقة:ثانية"}
        </span>
        <IconClock className="h-5 w-5 shrink-0 text-gov" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-60 rounded-lg border border-gray-300 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-3 gap-2">
            {cols.map((col) => (
              <div key={col.label} className="min-w-0">
                <div className="mb-1 text-center text-[11px] font-semibold text-gray-500">
                  {col.label}
                </div>
                <div className="h-40 overflow-y-auto rounded border border-gray-100">
                  {Array.from({ length: col.range }, (_, n) => {
                    const isSel = col.val === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => col.set(n)}
                        ref={(el) => {
                          if (isSel && el && open)
                            el.scrollIntoView({ block: "center" });
                        }}
                        className={`block w-full py-1 text-center text-sm tabular-nums transition ${
                          isSel
                            ? "bg-gov font-bold text-white"
                            : "hover:bg-gov-light"
                        }`}
                      >
                        {pad(n)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex justify-between border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={() => {
                setH(null);
                setM(null);
                setS(null);
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
                setH(n.getHours());
                setM(n.getMinutes());
                setS(n.getSeconds());
              }}
              className="text-xs font-semibold text-gov"
            >
              الآن
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-gov-dark"
            >
              تم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
