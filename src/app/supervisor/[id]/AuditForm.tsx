"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { VIOLATION_STATUSES, DIFFERENCE_REASONS } from "@/lib/constants";
import { IconAlertTriangle } from "@/components/icons";
import { submitAudit } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "جارٍ الحفظ…" : "حفظ التدقيق"}
    </button>
  );
}

interface AnimalTypeEntry {
  type: string;
  label: string;
}

interface AnimalTypeResult {
  violationStatus: string;
  differenceReasons: string[];
  locationLink: string;
  readingCount: number;
}

export default function AuditForm({
  declarationId,
  animalTypes,
  defaults,
  animalTypeFilter
}: {
  declarationId: number;
  animalTypes: AnimalTypeEntry[];
  defaults?: {
    animalResults: Record<string, AnimalTypeResult>;
  };
  animalTypeFilter?: string;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");

  function validate(fd: FormData): string[] {
    const errs: string[] = [];

    for (const { type, label } of animalTypes) {
      const locationLink = String(
        fd.get(`locationLink_${type}`) ?? ""
      ).trim();
      if (!locationLink)
        errs.push(`يرجى إدخال الموقع الجغرافي لقراءة شرائح ${label}.`);

      const file = fd.get(`chipFile_${type}`);
      const hasFile = file instanceof File && (file as File).size > 0;
      const existingCount =
        defaults?.animalResults[type]?.readingCount ?? 0;
      if (!hasFile && existingCount === 0)
        errs.push(`يرجى رفع ملف قراءات الشرائح لـ${label}.`);

      const status = String(
        fd.get(`violationStatus_${type}`) ?? ""
      ).trim();
      if (!status) errs.push(`يرجى تحديد حالة المخالفة لـ${label}.`);
    }

    return errs;
  }

  async function action(fd: FormData) {
    const errs = validate(fd);
    setErrors(errs);
    setServerError("");
    if (errs.length > 0) return;
    const res = await submitAudit({}, fd);
    if (res?.error) setServerError(res.error);
  }

  const allErrors = [...errors, ...(serverError ? [serverError] : [])];

  return (
    <form action={action} noValidate className="card space-y-5">
      <h2 className="text-lg font-bold text-gov-dark">بيانات التدقيق</h2>
      <input type="hidden" name="declarationId" value={declarationId} />
      <input
        type="hidden"
        name="animalTypesToProcess"
        value={JSON.stringify(animalTypes.map((at) => at.type))}
      />
      {animalTypeFilter && (
        <input type="hidden" name="animalTypeFilter" value={animalTypeFilter} />
      )}

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

      <div className="space-y-4">
        {animalTypes.map(({ type, label }) => {
          const saved = defaults?.animalResults[type];
          return (
            <div
              key={type}
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4"
            >
              <h3 className="font-semibold text-gov-dark">{label}</h3>

              <div>
                <label
                  className="field-label"
                  htmlFor={`loc_${type}`}
                >
                  الموقع الجغرافي لقراءة الشرائح
                </label>
                <input
                  id={`loc_${type}`}
                  name={`locationLink_${type}`}
                  className="field-input"
                  placeholder="https://maps.app.goo.gl/…  أو  29.1234, 47.9876"
                  defaultValue={saved?.locationLink ?? ""}
                />
              </div>

              <div>
                <label
                  className="field-label"
                  htmlFor={`file_${type}`}
                >
                  ملف قراءات الشرائح
                </label>
                <input
                  id={`file_${type}`}
                  name={`chipFile_${type}`}
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  className="field-input"
                />
                {(saved?.readingCount ?? 0) > 0 ? (
                  <p className="mt-1 text-xs text-gray-500">
                    محفوظ: {saved!.readingCount} قراءة. اترك فارغاً للاحتفاظ
                    بالقراءات الحالية.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    صيغة كل سطر: DDMMYYYY,HHmmss ,رقم الشريحة
                  </p>
                )}
                <a
                  href="/sample-chip-readings.txt"
                  download
                  className="mt-1 inline-block text-xs font-semibold text-gov"
                >
                  تنزيل ملف قراءات تجريبي ↓
                </a>
              </div>

              <div>
                <label
                  className="field-label"
                  htmlFor={`vs_${type}`}
                >
                  حالة المخالفة
                </label>
                <select
                  id={`vs_${type}`}
                  name={`violationStatus_${type}`}
                  className="field-input"
                  defaultValue={saved?.violationStatus ?? ""}
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
                <span className="field-label block mb-2">
                  أسباب الاختلاف في عدد الحيوانات (اختر كل ما ينطبق)
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DIFFERENCE_REASONS.map((d) => (
                    <label
                      key={d.value}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        name={`differenceReason_${type}`}
                        value={d.value}
                        defaultChecked={
                          saved?.differenceReasons.includes(d.value) ?? false
                        }
                        className="h-4 w-4 rounded border-gray-300 accent-gov"
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <SubmitButton />
        {animalTypeFilter && (
          <a
            href={`/supervisor/${declarationId}/print?animalType=${encodeURIComponent(animalTypeFilter)}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            طباعة هذا النوع
          </a>
        )}
        <a
          href={`/supervisor/${declarationId}/print`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
          طباعة جميع الأنواع
        </a>
      </div>
    </form>
  );
}
