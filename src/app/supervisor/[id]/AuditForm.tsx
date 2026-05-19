"use client";

import { useFormState, useFormStatus } from "react-dom";
import { VIOLATION_STATUSES, DIFFERENCE_REASONS } from "@/lib/constants";
import { submitAudit, type AuditState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "جارٍ الحفظ…" : "حفظ التدقيق"}
    </button>
  );
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
  const [state, formAction] = useFormState<AuditState, FormData>(
    submitAudit,
    {}
  );

  return (
    <form action={formAction} className="card space-y-4">
      <h2 className="text-lg font-bold text-gov-dark">بيانات التدقيق</h2>
      <input type="hidden" name="declarationId" value={declarationId} />

      {state.error && <div className="danger-box">{state.error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="chipReadStart">
            وقت بداية قراءة الرقائق
          </label>
          <input
            id="chipReadStart"
            name="chipReadStart"
            type="datetime-local"
            step={1}
            className="field-input"
            defaultValue={defaults?.chipReadStart}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="chipReadEnd">
            وقت نهاية قراءة الرقائق
          </label>
          <input
            id="chipReadEnd"
            name="chipReadEnd"
            type="datetime-local"
            step={1}
            className="field-input"
            defaultValue={defaults?.chipReadEnd}
            required
          />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="chipFile">
          رفع ملف قراءات الرقائق
        </label>
        <input
          id="chipFile"
          name="chipFile"
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          className="field-input"
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          صيغة كل سطر: DDMMYYYY,HHmmss ,رقم الرقاقة — تُحفظ القراءات الواقعة
          ضمن وقت البداية والنهاية فقط. سيظهر تحذير بأرقام الرقائق المخالفة
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
            required
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
