"use client";
// Legal disclaimer gate shown to first-time farmers. Displays three legal sections and a slide-to-confirm
// control; once slid, reveals the declaration form. Consent is not persisted client-side — the server-side
// `existing` check in farmer/page.tsx already handles skipping the gate for returning farmers.

import { useRef, useState } from "react";

// Wraps DeclarationForm for new users. Renders the legal page until the user slides to confirm.
export default function LegalGate({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) return <>{children}</>;

  return (
    <div className="space-y-5">
      <div className="card space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gov-dark">
            قبل البدء، يرجى قراءة البنود التالية والموافقة عليها
          </h2>
        </div>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-gov-dark">1. المقدمة</h3>
          <p className="text-sm leading-relaxed text-gray-800 text-justify">
            تهدف الهيئة العامة لشؤون الزراعة والثروة السمكية، من خلال إنشاء المنصة الإلكترونية لحصر أعداد الثروة الحيوانية وتطوير منظومة إدارة بياناتها في دولة الكويت، إلى تمكين المستفيدين من برنامج الدعم من إنجاز الإجراءات والخدمات ذات الصلة إلكترونياً بكل يسر وأمان، دون الحاجة إلى الحضور الشخصي. كما تؤكد الهيئة التزامها بسرية البيانات الشخصية وحمايتها وفقاً للتشريعات والضوابط المعمول بها، وصون حقوق المستفيدين من برامج الدعم، وتعزيز مبادئ الشفافية والدقة والموثوقية في جمع البيانات وتحديثها ومعالجتها، بما يسهم في رفع كفاءة إدارة الثروة الحيوانية ودعم اتخاذ القرار.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-gov-dark">2. إلزامية التسجيل</h3>
          <p className="text-sm leading-relaxed text-gray-800 text-justify">
            يعد التسجيل في المنصة الإلكترونية شرطاً أساسياً للاستفادة من برامج الدعم التي تقدمها الهيئة العامة لشؤون الزراعة والثروة السمكية. وفي حال عدم قيام المستفيد بالتسجيل أو استكمال البيانات المطلوبة خلال المدة المحددة، يجوز للهيئة تعليق صرف الدعم أو اتخاذ ما تراه مناسباً من إجراءات تنظيمية وفقاً للأحكام والضوابط المعمول بها.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold text-gov-dark">3. الإقرار والتعهد</h3>
          <div className="space-y-3 text-sm leading-relaxed text-gray-800 text-justify">
            <p>
              أقر أنا مقدم طلب التسجيل بأن جميع البيانات والمعلومات والمستندات المرفوعة عبر المنصة الإلكترونية التابعة للهيئة العامة لشؤون الزراعة والثروة السمكية صحيحة ودقيقة وكاملة، وأتعهد بتحديثها فور حدوث أي تغيير يطرأ عليها.
            </p>
            <p>
              كما أوافق على حق الهيئة في التحقق من صحة البيانات والمعلومات المرفوعة بكافة الوسائل التي تراها مناسبة، بما في ذلك الزيارات الميدانية والربط أو الاستعلام مع الجهات ذات العلاقة، وذلك وفقاً للتشريعات واللوائح والضوابط المعمول بها في دولة الكويت.
            </p>
            <p>
              وأقر بعلمي بأن تقديم أي بيانات، أو معلومات غير صحيحة، أو غير مكتملة، أو مضللة، أو الامتناع عن تحديثها عند تغيرها، قد يترتب عليه تعليق أو إيقاف الاستفادة من برامج الدعم أو الخدمات التي تقدمها الهيئة، وذلك دون الإخلال بحق الهيئة في اتخاذ ما يلزم من إجراءات إدارية أو قانونية وفقاً للأنظمة واللوائح المعتمدة.
            </p>
            <p>
              وبموافقتي على هذا الإقرار، أتحمل كامل المسؤولية عن صحة ودقة البيانات والمعلومات المرفوعة، وأقر بأن الهيئة غير مسؤولة عن أي آثار أو نتائج تترتب على تقديم بيانات غير صحيحة أو مخالفة للواقع.
            </p>
          </div>
        </section>
      </div>

      <div className="card">
        <p className="mt-3 text-center text-md text-black-500">
           أُقرّ وأتعهّد بأن جميع البيانات والمعلومات الواردة في هذا الإقرار صحيحةٌ وكاملةٌ ومطابقةٌ للواقع، وأتحمّل المسؤولية القانونية الكاملة عن أي معلومات مغلوطة أو ناقصة.
        </p>
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
