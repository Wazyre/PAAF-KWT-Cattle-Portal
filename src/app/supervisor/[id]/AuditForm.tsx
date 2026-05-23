"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { VIOLATION_STATUSES, DIFFERENCE_REASONS } from "@/lib/constants";
import { IconAlertTriangle } from "@/components/icons";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import { submitAudit } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "جارٍ الحفظ…" : "حفظ التدقيق"}
    </button>
  );
}

/** "YYYY-MM-DD" + "HH:mm[:ss]" -> "YYYY-MM-DDTHH:mm[:ss]" (empty if either missing). */
function combineDateTime(
  date: FormDataEntryValue | null,
  time: FormDataEntryValue | null
): string {
  const d = String(date ?? "").trim();
  const t = String(time ?? "").trim();
  return d && t ? `${d}T${t}` : "";
}

/** Split a stored "YYYY-MM-DDTHH:mm:ss" back into date + time defaults. */
function splitDateTime(v?: string): { date: string; time: string } {
  if (!v) return { date: "", time: "" };
  const [date, time] = v.split("T");
  return { date: date ?? "", time: time ?? "" };
}

export default function AuditForm({
  declarationId,
  defaults
}: {
  declarationId: number;
  defaults?: {
    chipReadStart: string;
    chipReadEnd: string;
    violationStatus: string;
    differenceReason: string | null;
  };
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");

  function validate(fd: FormData): string[] {
    const errs: string[] = [];
    const startDate = String(fd.get("startDate") ?? "").trim();
    const startTime = String(fd.get("startTime") ?? "").trim();
    const endDate = String(fd.get("endDate") ?? "").trim();
    const endTime = String(fd.get("endTime") ?? "").trim();
    const start = String(fd.get("chipReadStart") ?? "").trim();
    const end = String(fd.get("chipReadEnd") ?? "").trim();
    const status = String(fd.get("violationStatus") ?? "").trim();
    const file = fd.get("chipFile");

    if (!startDate || !startTime)
      errs.push("يرجى تحديد تاريخ ووقت بداية قراءة الشرائح.");
    if (!endDate || !endTime)
      errs.push("يرجى تحديد تاريخ ووقت نهاية قراءة الشرائح.");
    if (start && end && end <= start)
      errs.push("وقت النهاية يجب أن يكون بعد وقت البداية.");
    if (!(file instanceof File) || file.size === 0)
      errs.push("يرجى رفع ملف قراءات الشرائح.");
    if (!status) errs.push("يرجى تحديد حالة المخالفة.");
    return errs;
  }

  // Passing an async function to <form action> lets useFormStatus drive the
  // button's pending state and reset it correctly after the action finishes
  // (including the same-route redirect on success).
  async function action(fd: FormData) {
    // Recombine the separate date + time pickers into the single
    // "YYYY-MM-DDTHH:mm:ss" value the server action expects.
    fd.set("chipReadStart", combineDateTime(fd.get("startDate"), fd.get("startTime")));
    fd.set("chipReadEnd", combineDateTime(fd.get("endDate"), fd.get("endTime")));
    const errs = validate(fd);
    setErrors(errs);
    setServerError("");
    if (errs.length > 0) return;
    const res = await submitAudit({}, fd);
    if (res?.error) setServerError(res.error);
  }

  const allErrors = [...errors, ...(serverError ? [serverError] : [])];
  const startDef = splitDateTime(defaults?.chipReadStart);
  const endDef = splitDateTime(defaults?.chipReadEnd);

  return (
    <form action={action} noValidate className="card space-y-4">
      <h2 className="text-lg font-bold text-gov-dark">بيانات التدقيق</h2>
      <input type="hidden" name="declarationId" value={declarationId} />

      {allErrors.length > 0 && (
        <div className="danger-box space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <IconAlertTriangle className="h-5 w-5 shrink-0" />
            <span>يرجى تصحيح الأخطاء التالية:</span>
          </div>
          <ul className="list-disc space-y-0.5 pr-6 text-sm">
            {allErrors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="field-label">بداية قراءة الشرائح</legend>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500" htmlFor="startDate">
                التاريخ
              </label>
              <DatePicker id="startDate" name="startDate" defaultValue={startDef.date} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500" htmlFor="startTime">
                الوقت
              </label>
              <TimePicker id="startTime" name="startTime" defaultValue={startDef.time} />
            </div>
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="field-label">نهاية قراءة الشرائح</legend>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500" htmlFor="endDate">
                التاريخ
              </label>
              <DatePicker id="endDate" name="endDate" defaultValue={endDef.date} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500" htmlFor="endTime">
                الوقت
              </label>
              <TimePicker id="endTime" name="endTime" defaultValue={endDef.time} />
            </div>
          </div>
        </fieldset>
      </div>

      <div>
        <label className="field-label" htmlFor="chipFile">
          رفع ملف قراءات الشرائح
        </label>
        <input
          id="chipFile"
          name="chipFile"
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          className="field-input"
        />
        <p className="mt-1 text-xs text-gray-500">
          صيغة كل سطر: DDMMYYYY,HHmmss ,رقم الشريحة — تُحفظ القراءات الواقعة
          ضمن وقت البداية والنهاية فقط. سيظهر تحذير بأرقام الشرائح المخالفة
          عند وجود رمز/نجمة بجانب الرقم أو عند وجود قراءتين بفارق 5 ثوانٍ أو
          أقل.
        </p>
        <a
          href="/sample-chip-readings.txt"
          download
          className="mt-1 inline-block text-xs font-semibold text-gov"
        >
          تنزيل ملف قراءات تجريبي للعرض ↓
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="violationStatus">
            حالة المخالفة
          </label>
          <select
            id="violationStatus"
            name="violationStatus"
            className="field-input"
            defaultValue={defaults?.violationStatus ?? ""}
          >
            <option value="">— اختر —</option>
            {VIOLATION_STATUSES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="differenceReason">
            سبب الاختلاف في عدد الحيوانات
          </label>
          <select
            id="differenceReason"
            name="differenceReason"
            className="field-input"
            defaultValue={defaults?.differenceReason ?? ""}
          >
            <option value="">— لا يوجد —</option>
            {DIFFERENCE_REASONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <SubmitButton />
        <a
          href={`/supervisor/${declarationId}/print`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
          طباعة PDF
        </a>
      </div>
    </form>
  );
}
