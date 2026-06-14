"use client";

import { useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { DIFFERENCE_REASONS } from "@/lib/constants";
import { IconAlertTriangle } from "@/components/icons";
import { submitAudit } from "./actions";
import { processChipFile } from "@/lib/chips";
import type { ParsedReading } from "@/lib/chips";

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
  manualCount: number | null;
  nonStarCount: number;
  multipleChipsCount: number;
  doesntBelongCount?: number;
}

type ChipPreviewState = {
  readings: ParsedReading[];
  invalidLineCount: number;
  fileCount: number;
};

type ViolationCounts = {
  difference: number | null;
  notChipped: number | null;
  multipleChips: number | null;
};

function fmtMs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function countStarGroups(readings: { flaggedSymbol: boolean; sortKey: number }[]): number {
  const sorted = [...readings].sort((a, b) => a.sortKey - b.sortKey);
  let count = 0;
  let inGroup = false;
  for (const r of sorted) {
    if (!r.flaggedSymbol) { inGroup = false; }
    else if (!inGroup) { count++; inGroup = true; }
  }
  return count;
}

export default function AuditForm({
  declarationId,
  animalTypes,
  defaults,
  animalTypeFilter,
  headSupervisorMode = false
}: {
  declarationId: number;
  animalTypes: AnimalTypeEntry[];
  defaults?: {
    animalResults: Record<string, (AnimalTypeSiteResult | null | undefined)[]>;
  };
  animalTypeFilter?: string;
  headSupervisorMode?: boolean;
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [chipPreviews, setChipPreviews] = useState<Record<string, ChipPreviewState>>({});

  const [manualCounts, setManualCounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const { type, sites } of animalTypes) {
      for (const { siteIndex } of sites) {
        const saved = defaults?.animalResults[type]?.[siteIndex];
        init[`${type}_${siteIndex}`] = saved?.manualCount != null ? String(saved.manualCount) : "";
      }
    }
    return init;
  });

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

  async function handleChipFiles(key: string, files: FileList | null) {
    if (!files || files.length === 0) {
      setChipPreviews(prev => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    const texts = await Promise.all(Array.from(files).map(f => f.text()));
    const merged = texts.join("\n");
    const result = processChipFile(merged);
    setChipPreviews(prev => ({
      ...prev,
      [key]: { readings: result.kept, invalidLineCount: result.invalidLines.length, fileCount: files.length }
    }));
  }

  function getViolationCounts(key: string, type: string, siteIndex: number): ViolationCounts {
    const mc = parseInt(manualCounts[key] ?? "");
    if (isNaN(mc)) return { difference: null, notChipped: null, multipleChips: null };

    const preview = chipPreviews[key];
    if (preview) {
      const readings = preview.readings.map(r => ({ flaggedSymbol: r.flaggedSymbol, sortKey: r.ms }));
      const nonStarCount = readings.filter(r => !r.flaggedSymbol).length;
      return {
        difference: mc - preview.readings.length,
        notChipped: Math.max(0, mc - nonStarCount),
        multipleChips: countStarGroups(readings)
      };
    }

    const saved = defaults?.animalResults[type]?.[siteIndex];
    if (saved && saved.readingCount > 0) {
      return {
        difference: mc - saved.readingCount,
        notChipped: Math.max(0, mc - saved.nonStarCount),
        multipleChips: saved.multipleChipsCount
      };
    }

    return { difference: null, notChipped: null, multipleChips: null };
  }

  function validate(fd: FormData, forPrint = false): Record<string, string> {
    const errs: Record<string, string> = {};
    for (const { type, sites } of animalTypes) {
      for (const { siteIndex } of sites) {
        const key = `${type}_${siteIndex}`;
        const locationLink = String(fd.get(`locationLink_${type}_${siteIndex}`) ?? "").trim();
        const rawFiles = fd.getAll(`chipFile_${type}_${siteIndex}`);
        const hasFile = rawFiles.some(f => f instanceof File && (f as File).size > 0);
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

  const returnToBase = headSupervisorMode
    ? `/head-supervisor/${declarationId}`
    : `/supervisor/${declarationId}`;

  return (
    <form ref={formRef} action={action} noValidate className="card space-y-5">
      <h2 className="text-lg font-bold text-gov-dark">بيانات التدقيق</h2>
      <input type="hidden" name="declarationId" value={declarationId} />
      <input type="hidden" name="returnTo" value={returnToBase} />
      <input type="hidden" name="animalTypesToProcess" value={JSON.stringify(animalTypes)} />
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
              const previewKey = `${type}_${siteIndex}`;
              const preview = chipPreviews[previewKey];
              const counts = getViolationCounts(previewKey, type, siteIndex);

              return (
                <div
                  key={previewKey}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4"
                >
                  <h4 className="font-semibold text-gray-700">
                    {gatheringPointLabel} - الموقع {siteIndex + 1}
                  </h4>
                  {fieldErrors[`${previewKey}_site`] && (
                    <p className="text-sm text-red-600">{fieldErrors[`${previewKey}_site`]}</p>
                  )}

                  {/* Geographic location */}
                  <div>
                    <label className="field-label" htmlFor={`loc_${previewKey}`}>
                      الموقع الجغرافي لقراءة الشرائح
                    </label>
                    <input
                      id={`loc_${previewKey}`}
                      name={`locationLink_${type}_${siteIndex}`}
                      className="field-input"
                      placeholder="https://maps.app.goo.gl/…  أو  29.1234, 47.9876"
                      defaultValue={saved?.locationLink ?? ""}
                    />
                    {fieldErrors[`${previewKey}_location`] && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors[`${previewKey}_location`]}</p>
                    )}
                  </div>

                  {/* Manual count */}
                  <div>
                    <label className="field-label" htmlFor={`manual_${previewKey}`}>
                      إجمالي {label} المحسوبة يدوياً
                    </label>
                    <input
                      id={`manual_${previewKey}`}
                      name={`manualCount_${type}_${siteIndex}`}
                      type="number"
                      min={0}
                      className="field-input"
                      placeholder="أدخل العدد المحسوب ميدانياً"
                      value={manualCounts[previewKey] ?? ""}
                      onChange={(e) =>
                        setManualCounts(prev => ({ ...prev, [previewKey]: e.target.value }))
                      }
                    />
                  </div>

                  {/* Chip file upload */}
                  <div>
                    <label className="field-label" htmlFor={`file_${previewKey}`}>
                      ملفات قراءات الشرائح
                    </label>
                    <input
                      id={`file_${previewKey}`}
                      name={`chipFile_${type}_${siteIndex}`}
                      type="file"
                      accept=".txt,.csv,text/plain,text/csv"
                      className="field-input"
                      multiple
                      onChange={(e) => handleChipFiles(previewKey, e.target.files)}
                    />
                    {(saved?.readingCount ?? 0) > 0 ? (
                      <p className="mt-1 text-xs text-gray-500">
                        محفوظ: {saved!.readingCount} قراءة. اترك فارغاً للاحتفاظ بالقراءات الحالية، أو اختر ملفات جديدة لاستبدالها.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">
                        يمكنك اختيار أكثر من ملف. صيغة كل سطر: DDMMYYYY,HHmmss ,رقم الشريحة
                      </p>
                    )}
                    {fieldErrors[`${previewKey}_chip`] && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors[`${previewKey}_chip`]}</p>
                    )}
                    <a
                      href="/sample-chip-readings.txt"
                      download
                      className="mt-1 inline-block text-xs font-semibold text-gov"
                    >
                      تنزيل ملف قراءات تجريبي ↓
                    </a>

                    {preview && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-3 text-xs text-gray-700">
                          <span className="font-semibold">
                            {preview.fileCount > 1 ? `${preview.fileCount} ملفات` : "ملف واحد"} - {preview.readings.length} قراءة صالحة
                          </span>
                          {preview.invalidLineCount > 0 && (
                            <span className="text-amber-700 font-semibold">({preview.invalidLineCount} سطر غير صالح)</span>
                          )}
                          {preview.readings.some(r => r.flaggedSymbol || r.flaggedProximity) && (
                            <span className="text-red-600 font-semibold">يوجد قراءات مُنبَّه عليها</span>
                          )}
                        </div>
                        <div className="max-h-64 overflow-y-auto rounded border border-gray-200">
                          <table className="w-full border-collapse text-xs">
                            <thead className="sticky top-0 bg-gov-light">
                              <tr className="text-gov-dark">
                                <th className="border border-gray-300 px-2 py-1 text-center">#</th>
                                <th className="border border-gray-300 px-2 py-1 text-center">وقت القراءة</th>
                                <th className="border border-gray-300 px-2 py-1 text-center">رقم الشريحة</th>
                                <th className="border border-gray-300 px-2 py-1 text-center">تنبيهات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {preview.readings.map((r, i) => {
                                const anyFlag = r.flaggedSymbol || r.flaggedProximity;
                                const notes = [
                                  r.flaggedSymbol ? "رمز" : "",
                                  r.flaggedProximity ? "تقارب" : ""
                                ].filter(Boolean).join(" + ");
                                return (
                                  <tr key={i} className={anyFlag ? "bg-amber-50 text-center" : "text-center"}>
                                    <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
                                    <td className="border border-gray-300 px-2 py-1">{fmtMs(r.ms)}</td>
                                    <td className="border border-gray-300 px-2 py-1 font-mono">{r.rawChip}</td>
                                    <td className="border border-gray-300 px-2 py-1">{notes || "-"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Difference reasons */}
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="field-label">
                        أسباب الاختلاف في عدد {label} (اختر كل ما ينطبق)
                      </span>
                      {/* {counts.difference !== null && (
                        <span className={`text-sm font-semibold ${counts.difference < 0 ? "text-green-700" : counts.difference > 0 ? "text-red-600" : "text-gray-600"}`}>
                          الفرق: {counts.difference > 0 ? `+${counts.difference}` : counts.difference}
                        </span>
                      )} */}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {DIFFERENCE_REASONS.map((d) => {
                        const savedDoesntBelongCount = saved?.doesntBelongCount ?? null;

                        const autoState: boolean | null =
                          d.value === "NOT_CHIPPED"
                            ? counts.notChipped !== null ? counts.notChipped > 0 : null
                            : d.value === "MULTIPLE_CHIPS"
                            ? counts.multipleChips !== null ? counts.multipleChips > 0 : null
                            : d.value === "CHIP_DOESNT_BELONG"
                            ? savedDoesntBelongCount !== null ? savedDoesntBelongCount > 0 : null
                            : null;

                        const isAuto = autoState !== null;
                        const effectiveChecked = isAuto
                          ? autoState
                          : (checkedReasons[previewKey]?.has(d.value) ?? false);

                        const countBadge: number | null =
                          d.value === "NOT_CHIPPED" ? counts.notChipped
                          : d.value === "MULTIPLE_CHIPS" ? counts.multipleChips
                          : d.value === "CHIP_DOESNT_BELONG" ? savedDoesntBelongCount
                          : null;

                        return (
                          <label
                            key={d.value}
                            className={`flex items-center gap-2 text-sm ${isAuto ? "cursor-default" : "cursor-pointer"}`}
                          >
                            {isAuto && effectiveChecked && (
                              <input type="hidden" name={`differenceReason_${type}_${siteIndex}`} value={d.value} />
                            )}
                            <input
                              type="checkbox"
                              {...(!isAuto && { name: `differenceReason_${type}_${siteIndex}`, value: d.value })}
                              checked={effectiveChecked}
                              disabled={isAuto}
                              onChange={isAuto ? undefined : (e) => toggleReason(type, siteIndex, d.value, e.target.checked)}
                              className={`h-4 w-4 rounded border-gray-300 accent-gov ${isAuto ? "opacity-70" : ""}`}
                            />
                            <span className={isAuto ? "text-gray-600" : ""}>{d.label}</span>
                            {countBadge !== null && (
                              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${effectiveChecked ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-700"}`}>
                                {countBadge}
                              </span>
                            )}
                            {isAuto && (
                              <span className="text-xs text-gray-400">(تلقائي)</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    {(() => {
                      const savedDoesntBelongCount = saved?.doesntBelongCount ?? null;
                      const hasViolation = DIFFERENCE_REASONS.some((d) => {
                        const autoState: boolean | null =
                          d.value === "NOT_CHIPPED"
                            ? counts.notChipped !== null ? counts.notChipped > 0 : null
                            : d.value === "MULTIPLE_CHIPS"
                            ? counts.multipleChips !== null ? counts.multipleChips > 0 : null
                            : d.value === "CHIP_DOESNT_BELONG"
                            ? savedDoesntBelongCount !== null ? savedDoesntBelongCount > 0 : null
                            : null;
                        return autoState !== null ? autoState : (checkedReasons[previewKey]?.has(d.value) ?? false);
                      });
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
            onClick={() => handlePrint(`${returnToBase}/print?animalType=${encodeURIComponent(animalTypeFilter)}`)}
            className="btn-secondary"
          >
            طباعة هذا النوع
          </button>
        )}
        <button
          type="button"
          onClick={() => handlePrint(`${returnToBase}/print`)}
          className="btn-secondary"
        >
          طباعة جميع الأنواع
        </button>
      </div>
    </form>
  );
}
