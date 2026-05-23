"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { VIOLATION_STATUSES, DIFFERENCE_REASONS } from "@/lib/constants";
import { IconAlertTriangle } from "@/components/icons";
import { submitAudit, type AuditState } from "./actions";

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
  const [state, formAction] = useFormState<AuditState, FormData>(
    submitAudit,
    {}
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function validate(fd: FormData): string[] {
    const errs: string[] = [];
    const start = String(fd.get("chipReadStart") ?? "").trim();
    const end = String(fd.get("chipReadEnd") ?? "").trim();
    const status = String(fd.get("violationStatus") ?? "").trim();
    const file = fd.get("chipFile");

    if (!start) errs.push("يرجى تحديد وقت بداية قراءة الشرائح.");
    if (!end) errs.push("يرجى تحديد وقت نهاية قراءة الشرائح.");
    if (start && end && end <= start)
      errs.push("وقت النهاية يجب أن يكون بعد وقت البداية.");
    if (!(file instanceof File) || file.size === 0)
      errs.push("يرجى رفع ملف قراءات الشرائح.");
    if (!status) errs.push("يرجى تحديد حالة المخالفة.");
    return errs;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errs = validate(fd);
    setErrors(errs);
    if (errs.length > 0) return;
    startTransition(() => formAction(fd));
  }

  const allErrors = [...errors, ...(state.error ? [state.error] : [])];

  return (
    <form onSubmit={handleSubmit} noValidate className="card space-y-4">
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
        <div>
          <label className="field-label" htmlFor="chipReadStart">
            وقت بداية قراءة الشرائح
          </label>
          <input
            id="chipReadStart"
            name="chipReadStart"
            type="datetime-local"
            step={1}
            className="field-input"
            defaultValue={defaults?.chipReadStart}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="chipReadEnd">
            وقت نهاية قراءة الشرائح
          </label>
          <input
            id="chipReadEnd"
            name="chipReadEnd"
            type="datetime-local"
            step={1}
            className="field-input"
            defaultValue={defaults?.chipReadEnd}
          />
        </div>
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
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "جارٍ الحفظ…" : "حفظ التدقيق"}
        </button>
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
