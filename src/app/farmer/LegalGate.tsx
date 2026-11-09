"use client";
// Legal disclaimer gate shown to first-time farmers. Displays three legal sections and a slide-to-confirm
// control; once slid, reveals the declaration form. Consent is not persisted client-side — the server-side
// `existing` check in farmer/page.tsx already handles skipping the gate for returning farmers.

import { useRef, useState } from "react";
import { LEGAL_CONFIRMATION, LEGAL_HEADING, LEGAL_SECTIONS } from "@/lib/legal";

// Wraps DeclarationForm for new users. Renders the legal page until the user slides to confirm.
export default function LegalGate({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) return <>{children}</>;

  return (
    <div className="space-y-5">
      <div className="card space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gov-dark">{LEGAL_HEADING}</h2>
        </div>

        {LEGAL_SECTIONS.map((section) => (
          <section key={section.title} className="space-y-2">
            <h3 className="text-base font-bold text-gov-dark">{section.title}</h3>
            {section.paragraphs.length === 1 ? (
              <p className="text-sm leading-relaxed text-gray-800 text-justify">{section.paragraphs[0]}</p>
            ) : (
              <div className="space-y-3 text-sm leading-relaxed text-gray-800 text-justify">
                {section.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="card">
        <p className="mt-3 text-center text-md text-black-500">{LEGAL_CONFIRMATION}</p>
        <SlideToConfirm onConfirm={() => setConfirmed(true)} />
        
      </div>
    </div>
  );
}

// Draggable slide-to-confirm control. Knob starts on the right (RTL start), user drags leftward across
// the track. Fires onConfirm once the knob passes 92% of the track length.
function SlideToConfirm({ onConfirm }: { onConfirm: () => void }) {
  const KNOB = 48;
  const PAD = 4;
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startProgressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  function maxDrag(): number {
    const w = trackRef.current?.clientWidth ?? 0;
    return Math.max(1, w - KNOB - PAD * 2);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (done) return;
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startProgressRef.current = progress;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || done) return;
    // In RTL layout leftward pointer motion decreases clientX; treat that as forward progress.
    const delta = startXRef.current - e.clientX;
    const next = Math.max(0, Math.min(1, startProgressRef.current + delta / maxDrag()));
    setProgress(next);
  }

  function endDrag() {
    if (!draggingRef.current || done) return;
    draggingRef.current = false;
    if (progress >= 0.92) {
      setProgress(1);
      setDone(true);
      setTimeout(onConfirm, 220);
    } else {
      setProgress(0);
    }
  }

  const knobRightExpr = `calc(${PAD}px + ${progress} * (100% - ${KNOB + PAD * 2}px))`;
  const fillWidthExpr = `calc(${KNOB + PAD * 2}px + ${progress} * (100% - ${KNOB + PAD * 2}px))`;

  return (
    <div
      ref={trackRef}
      className="relative h-14 w-full select-none overflow-hidden rounded-full border border-gray-300 bg-gray-100"
    >
      <div
        className="absolute inset-y-0 right-0 bg-gov/25 transition-[width] duration-100"
        style={{ width: fillWidthExpr }}
      />
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-semibold text-gray-700">
        {done ? (
          <span>تم التأكيد</span>
        ) : (
          <span>
            اسحب للتأكيد على الإقرار <span dir="ltr">←</span>
          </span>
        )}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="button"
        aria-label="اسحب للتأكيد"
        className="absolute top-1/2 grid h-12 w-12 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full bg-gov text-lg font-bold text-white shadow-md transition-[right] duration-100 active:cursor-grabbing"
        style={{ right: knobRightExpr }}
      >
        <span dir="ltr">←</span>
      </div>
    </div>
  );
}
