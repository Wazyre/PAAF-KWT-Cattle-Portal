"use client";

import { useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { DIFFERENCE_REASONS } from "@/lib/constants";
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

export interface SiteEntry {
  siteIndex: number;
  gatheringPointLabel: string;
}

export interface AnimalTypeEntry {
  type: string;
  label: string;
  sites: SiteEntry[];
}

interface AnimalTypeSiteResult {
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
    animalResults: Record<string, (AnimalTypeSiteResult | null | undefined)[]>;
  };
  animalTypeFilter?: string;
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const [checkedReasons, setCheckedReasons] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const { type, sites } of animalTypes) {
      for (const { siteIndex } of sites) {
        const saved = defaults?.animalResults[type]?.[siteIndex];
        init[`${type}_${siteIndex}`] = new Set(saved?.differenceReasons ?? []);
      }
    }
    return init;
  });

  function toggleReason(type: string, siteIndex: number, reason: string, checked: boolean) {
    setCheckedReasons(prev => {
      const key = `${type}_${siteIndex}`;
      const next = new Set(prev[key] ?? []);
      if (checked) next.add(reason); else next.delete(reason);
      return { ...prev, [key]: next };
    });
  }

  function validate(fd: FormData, forPrint = false): Record<string, string> {
    const errs: Record<string, string> = {};

    for (const { type, sites } of animalTypes) {
      for (const { siteIndex } of sites) {
        const key = `${type}_${siteIndex}`;
        const locationLink = String(fd.get(`locationLink_${type}_${siteIndex}`) ?? "").trim();
        const file = fd.get(`chipFile_${type}_${siteIndex}`);
        const hasFile = file instanceof File && file.size > 0;
        const existingCount = defaults?.animalResults[type]?.[siteIndex]?.readingCount ?? 0;
        const hasReadings = hasFile || existingCount > 0;

        const filledCount = [!!locationLink, hasReadings].filter(Boolean).length;

        if (filledCount === 2) continue;

        if (filledCount === 0) {
          if (forPrint) errs[`${key}_site`] = "لم تُكتمل بيانات هذا الموقع.";
          continue;
        }

        if (!locationLink) errs[`${key}_location`] = "يرجى إدخال الموقع الجغرافي.";
        if (!hasReadings) errs[`${key}_chip`] = "يرجى رفع ملف قراءات الشرائح.";
      }
    }

    return errs;
  }

  async function action(fd: FormData) {
    const errs = validate(fd);
    setFieldErrors(errs);
    setServerError("");
    if (Object.keys(errs).length > 0) return;
    const res = await submitAudit({}, fd);
    if (res?.error) setServerError(res.error);
  }

  function handlePrint(url: string) {
    if (!formRef.current) { window.open(url, "_blank"); return; }
    const fd = new FormData(formRef.current);
    const errs = validate(fd, true);
    setFieldErrors(errs);
    setServerError("");
    if (Object.keys(errs).length > 0) return;
    window.open(url, "_blank");
  }

  return (
    <form ref={formRef} action={action} noValidate className="card space-y-5">
      <h2 className="text-lg font-bold text-gov-dark">بيانات التدقيق</h2>
      <input type="hidden" name="declarationId" value={declarationId} />
      <input
        type="hidden"
        name="animalTypesToProcess"
        value={JSON.stringify(animalTypes)}
      />
      {animalTypeFilter && (
        <input type="hidden" name="animalTypeFilter" value={animalTypeFilter} />
      )}

      {serverError && (
        <div className="danger-box flex items-center gap-2">
          <IconAlertTriangle className="h-5 w-5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <div className="space-y-6">
        {animalTypes.map(({ type, label, sites }) => (
          <div key={type} className="space-y-3">
            <h3 className="font-bold text-gov-dark border-b border-gray-200 pb-2">{label}</h3>

            {sites.map(({ siteIndex, gatheringPointLabel }) => {
              const saved = defaults?.animalResults[type]?.[siteIndex];
              return (
                <div
                  key={`${type}_${siteIndex}`}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4"
                >
                  <h4 className="font-semibold text-gray-700">
                    {gatheringPointLabel} — الموقع {siteIndex + 1}
                  </h4>
                  {fieldErrors[`${type}_${siteIndex}_site`] && (
                    <p className="text-sm text-red-600">{fieldErrors[`${type}_${siteIndex}_site`]}</p>
                  )}

                  <div>
                    <label className="field-label" htmlFor={`loc_${type}_${siteIndex}`}>
                      الموقع الجغرافي لقراءة الشرائح
                    </label>
                    <input
                      id={`loc_${type}_${siteIndex}`}
                      name={`locationLink_${type}_${siteIndex}`}
                      className="field-input"
                      placeholder="https://maps.app.goo.gl/…  أو  29.1234, 47.9876"
                      defaultValue={saved?.locationLink ?? ""}
                    />
                    {fieldErrors[`${type}_${siteIndex}_location`] && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors[`${type}_${siteIndex}_location`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="field-label" htmlFor={`file_${type}_${siteIndex}`}>
                      ملف قراءات الشرائح
                    </label>
                    <input
                      id={`file_${type}_${siteIndex}`}
                      name={`chipFile_${type}_${siteIndex}`}
                      type="file"
                      accept=".txt,.csv,text/plain,text/csv"
                      className="field-input"
                    />
                    {(saved?.readingCount ?? 0) > 0 ? (
                      <p className="mt-1 text-xs text-gray-500">
                        محفوظ: {saved!.readingCount} قراءة. اترك فارغاً للاحتفاظ بالقراءات الحالية.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">
                        صيغة كل سطر: DDMMYYYY,HHmmss ,رقم الشريحة
                      </p>
                    )}
                    {fieldErrors[`${type}_${siteIndex}_chip`] && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors[`${type}_${siteIndex}_chip`]}</p>
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
                            name={`differenceReason_${type}_${siteIndex}`}
                            value={d.value}
                            checked={checkedReasons[`${type}_${siteIndex}`]?.has(d.value) ?? false}
                            onChange={(e) => toggleReason(type, siteIndex, d.value, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 accent-gov"
                          />
                          {d.label}
                        </label>
                      ))}
                    </div>
                    {(() => {
                      const hasViolation = (checkedReasons[`${type}_${siteIndex}`]?.size ?? 0) > 0;
                      return (
                        <>
                          <input
                            type="hidden"
                            name={`violationStatus_${type}_${siteIndex}`}
                            value={hasViolation ? "VIOLATION" : "NONE"}
                          />
                          <p className={`mt-2 text-sm font-semibold ${hasViolation ? "text-red-600" : "text-green-700"}`}>
                            حالة المخالفة: {hasViolation ? "توجد مخالفة" : "لا توجد مخالفة"}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <SubmitButton />
        {animalTypeFilter && (
          <button
            type="button"
            onClick={() => handlePrint(`/supervisor/${declarationId}/print?animalType=${encodeURIComponent(animalTypeFilter)}`)}
            className="btn-secondary"
          >
            طباعة هذا النوع
          </button>
        )}
        <button
          type="button"
          onClick={() => handlePrint(`/supervisor/${declarationId}/print`)}
          className="btn-secondary"
        >
          طباعة جميع الأنواع
        </button>
      </div>
    </form>
  );
}
