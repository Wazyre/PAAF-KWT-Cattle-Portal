"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import dynamic from "next/dynamic";
import { GATHERING_POINTS, ANIMAL_TYPES, MIN_SITE_DISTANCE_METERS } from "@/lib/constants";
import { IconAlertTriangle } from "@/components/icons";
import { isValidKuwaitMobile, KUWAIT_MOBILE_ERROR } from "@/lib/phone";
import { submitDeclaration } from "./actions";
import { distanceMeters } from "@/lib/geo";

interface InitialLocation {
  gatheringPoint: string;
  latitude: number;
  longitude: number;
  locationLink: string;
  chippedCount: number;
  males: number;
  females: number;
  numTenders: number;
}

interface InitialAnimalGroup {
  animalType: string;
  locations: InitialLocation[];
}

interface InitialData {
  mobile: string;
  animalGroups: InitialAnimalGroup[];
}

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending
        ? isEditing ? "جارٍ التحديث…" : "جارٍ الإرسال…"
        : isEditing ? "تحديث الإقرار" : "إرسال الإقرار"}
    </button>
  );
}

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[240px] place-items-center rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-500">
      جارٍ تحميل الخريطة…
    </div>
  )
});

interface LocationRow {
  id: string;
  gatheringPoint: string;
  locationLink: string;
  lat: number | null;
  lng: number | null;
  geoStatus: "" | "loading" | "ok" | "error";
  chippedCount: string;
  males: string;
  numTenders: string;
}

interface AnimalTypeSection {
  animalType: string;
  locations: LocationRow[];
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyLocation(): LocationRow {
  return {
    id: genId(),
    gatheringPoint: "",
    locationLink: "",
    lat: null,
    lng: null,
    geoStatus: "",
    chippedCount: "",
    males: "",
    numTenders: ""
  };
}

function initSections(initialData?: InitialData | null): AnimalTypeSection[] {
  return ANIMAL_TYPES.map((at) => {
    const group = initialData?.animalGroups.find((g) => g.animalType === at.value);
    if (!group) return { animalType: at.value, locations: [] };
    return {
      animalType: at.value,
      locations: group.locations.map((l) => ({
        id: genId(),
        gatheringPoint: l.gatheringPoint,
        locationLink: l.locationLink,
        lat: l.latitude,
        lng: l.longitude,
        geoStatus: "ok" as const,
        chippedCount: String(l.chippedCount),
        males: String(l.males),
        numTenders: String(l.numTenders)
      }))
    };
  });
}

function intStr(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

export default function DeclarationForm({
  civilId,
  name,
  initialData
}: {
  civilId: string;
  name: string;
  initialData?: InitialData | null;
}) {
  const isEditing = !!initialData;
  const [sections, setSections] = useState<AnimalTypeSection[]>(() => initSections(initialData));
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");

  function validateAll(mobile: string, pledged: boolean): { fieldErrors: Record<string, string>; formErrors: string[] } {
    const fieldErrs: Record<string, string> = {};
    const formErrs: string[] = [];

    if (!mobile.trim()) fieldErrs.mobile = "يرجى إدخال رقم الهاتف الشخصي.";
    else if (!isValidKuwaitMobile(mobile)) fieldErrs.mobile = KUWAIT_MOBILE_ERROR;

    if (!pledged) fieldErrs.pledge = "يجب الموافقة على الإقرار قبل الإرسال.";

    const activeSections = sections.filter((s) => s.locations.length > 0);
    if (activeSections.length === 0) formErrs.push("يرجى إضافة موقع واحد على الأقل.");

    sections.forEach((s, ai) => {
      const atLabel = ANIMAL_TYPES[ai]?.label ?? "الحيوانات";
      s.locations.forEach((loc, li) => {
        if (!loc.gatheringPoint)
          fieldErrs[`gathering_${ai}_${li}`] = "يرجى اختيار نقطة التجمّع.";

        const chipped = intStr(loc.chippedCount);
        if (chipped === null)
          fieldErrs[`chipped_${ai}_${li}`] = `يرجى إدخال عدد رؤوس ${atLabel} المُرقّمة.`;
        else if (Number.isNaN(chipped))
          fieldErrs[`chipped_${ai}_${li}`] = `عدد رؤوس ${atLabel} المُرقّمة غير صحيح.`;

        const males = intStr(loc.males);
        if (males === null)
          fieldErrs[`males_${ai}_${li}`] = "يرجى إدخال عدد الذكور.";
        else if (Number.isNaN(males))
          fieldErrs[`males_${ai}_${li}`] = "عدد الذكور غير صحيح.";
        else if (typeof chipped === "number" && !Number.isNaN(chipped) && males > chipped)
          fieldErrs[`males_${ai}_${li}`] = `عدد الذكور لا يمكن أن يتجاوز عدد رؤوس ${atLabel} المُرقّمة.`;

        const tenders = intStr(loc.numTenders);
        if (tenders === null)
          fieldErrs[`tenders_${ai}_${li}`] = "يرجى إدخال عدد العمال / الرعاة.";
        else if (Number.isNaN(tenders))
          fieldErrs[`tenders_${ai}_${li}`] = "عدد العمال/الرعاة غير صحيح.";

        if (loc.lat === null || loc.lng === null)
          fieldErrs[`geo_${ai}_${li}`] = "يرجى تحديد الموقع الجغرافي بدقة (اضغط \"رفع الموقع\").";
      });

      // Same-type proximity check
      for (let i = 0; i < s.locations.length; i++) {
        for (let j = i + 1; j < s.locations.length; j++) {
          const a = s.locations[i];
          const b = s.locations[j];
          if (a.lat !== null && a.lng !== null && b.lat !== null && b.lng !== null) {
            const d = distanceMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
            if (d < MIN_SITE_DISTANCE_METERS) {
              const msg = `الموقع ${i + 1} والموقع ${j + 1} قريبان جداً (${d.toFixed(0)} م). يجب أن تبعد المواقع عن بعضها ${MIN_SITE_DISTANCE_METERS} متراً على الأقل.`;
              fieldErrs[`geo_${ai}_${i}`] = msg;
              fieldErrs[`geo_${ai}_${j}`] = msg;
            }
          }
        }
      }
    });

    return { fieldErrors: fieldErrs, formErrors: formErrs };
  }

  async function action(fd: FormData) {
    const mobile = String(fd.get("mobile") ?? "");
    const pledged = fd.get("pledge") === "on";
    const { fieldErrors: fieldErrs, formErrors: formErrs } = validateAll(mobile, pledged);
    setFieldErrors(fieldErrs);
    setFormErrors(formErrs);
    setServerError("");
    if (Object.keys(fieldErrs).length > 0 || formErrs.length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const res = await submitDeclaration({}, fd);
    if (res?.error) {
      setServerError(res.error);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function update(mutator: (draft: AnimalTypeSection[]) => void) {
    setSections((prev) => {
      const next = structuredClone(prev);
      mutator(next);
      return next;
    });
  }

  function addLocation(ai: number) {
    const loc = emptyLocation();
    update((d) => { d[ai].locations.push(loc); });
    setNewIds((prev) => new Set([...prev, loc.id]));
  }

  function removeLocation(ai: number, li: number) {
    const id = sections[ai].locations[li].id;
    setRemovingIds((prev) => new Set([...prev, id]));
    setTimeout(() => {
      setSections((prev) => {
        const next = structuredClone(prev);
        next[ai].locations = next[ai].locations.filter((_, idx) => idx !== li);
        return next;
      });
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 180);
  }

  async function resolveLocation(ai: number, li: number) {
    const link = sections[ai].locations[li].locationLink.trim();
    if (!link) return;
    update((d) => { d[ai].locations[li].geoStatus = "loading"; });
    try {
      const res = await fetch(`/api/resolve-location?u=${encodeURIComponent(link)}`);
      if (!res.ok) throw new Error("unresolved");
      const data = (await res.json()) as { lat: number; lng: number };
      update((d) => {
        d[ai].locations[li].lat = data.lat;
        d[ai].locations[li].lng = data.lng;
        d[ai].locations[li].geoStatus = "ok";
      });
    } catch {
      update((d) => {
        d[ai].locations[li].lat = null;
        d[ai].locations[li].lng = null;
        d[ai].locations[li].geoStatus = "error";
      });
    }
  }

  const payload = JSON.stringify(
    sections
      .filter((s) => s.locations.length > 0)
      .map((s) => ({
        animalType: s.animalType,
        locations: s.locations.map((l) => {
          const chipped = parseInt(l.chippedCount) || 0;
          const males = Math.min(parseInt(l.males) || 0, chipped);
          const females = Math.max(0, chipped - males);
          return {
            gatheringPoint: l.gatheringPoint,
            locationLink: l.locationLink,
            lat: l.lat,
            lng: l.lng,
            chippedCount: l.chippedCount,
            males: String(males),
            females: String(females),
            numTenders: l.numTenders
          };
        })
      }))
  );

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="civilId" value={civilId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="payload" value={payload} />

      {(formErrors.length > 0 || serverError) && (
        <div className="danger-box space-y-1">
          <div className="flex items-center gap-2 font-bold">
            <IconAlertTriangle className="h-5 w-5 shrink-0" />
            <span>يرجى تصحيح الأخطاء التالية:</span>
          </div>
          <ul className="list-disc space-y-0.5 pr-6 text-sm">
            {[...formErrors, ...(serverError ? [serverError] : [])].map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-gov-dark">بيانات المُقرّ</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">الاسم</label>
            <input className="field-input" value={name} readOnly />
          </div>
          <div>
            <label className="field-label">الرقم المدني</label>
            <input className="field-input" value={civilId} readOnly />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="mobile">
            رقم الهاتف الشخصي لمربّي المواشي
          </label>
          <input
            id="mobile"
            name="mobile"
            inputMode="numeric"
            className="field-input"
            placeholder="مثال: 9XXXXXXX"
            defaultValue={initialData?.mobile ?? ""}
          />
          {fieldErrors.mobile && (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.mobile}</p>
          )}
        </div>
      </div>

      {ANIMAL_TYPES.map((at, ai) => {
        const section = sections[ai];
        return (
          <div key={at.value} className="card space-y-4">
            <h2 className="text-lg font-bold text-gov-dark">{at.label}</h2>

            {section.locations.map((loc, li) => (
              <div
                key={loc.id}
                className={`rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 ${
                  removingIds.has(loc.id)
                    ? "animate-fade-out"
                    : newIds.has(loc.id)
                    ? "animate-slide-in"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    الموقع {li + 1}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-600"
                    onClick={() => removeLocation(ai, li)}
                  >
                    حذف
                  </button>
                </div>

                <div>
                  <label className="field-label">نقطة التجمّع</label>
                  <select
                    className="field-input"
                    value={loc.gatheringPoint}
                    onChange={(e) =>
                      update((d) => { d[ai].locations[li].gatheringPoint = e.target.value; })
                    }
                  >
                    <option value="">— اختر —</option>
                    {GATHERING_POINTS.map((gp) => (
                      <option key={gp.value} value={gp.value}>{gp.label}</option>
                    ))}
                  </select>
                  {fieldErrors[`gathering_${ai}_${li}`] && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors[`gathering_${ai}_${li}`]}</p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">
                      عدد رؤوس {at.label} المُرقّمة (تحمل شريحة)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="field-input"
                      value={loc.chippedCount}
                      onChange={(e) =>
                        update((d) => { d[ai].locations[li].chippedCount = e.target.value; })
                      }
                    />
                    {fieldErrors[`chipped_${ai}_${li}`] && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors[`chipped_${ai}_${li}`]}</p>
                    )}
                  </div>
                  <div>
                    <label className="field-label">عدد الذكور</label>
                    <input
                      type="number"
                      min={0}
                      className="field-input"
                      value={loc.males}
                      onChange={(e) =>
                        update((d) => { d[ai].locations[li].males = e.target.value; })
                      }
                    />
                    {loc.males !== "" && loc.chippedCount !== "" && (() => {
                      const chipped = parseInt(loc.chippedCount) || 0;
                      const males = parseInt(loc.males) || 0;
                      const females = Math.max(0, chipped - males);
                      return (
                        <p className="mt-1 text-xs text-gray-500">
                          عدد الإناث: {females}
                        </p>
                      );
                    })()}
                    {fieldErrors[`males_${ai}_${li}`] && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors[`males_${ai}_${li}`]}</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="field-label">عدد العمال / الرعاة</label>
                    <input
                      type="number"
                      min={0}
                      className="field-input"
                      value={loc.numTenders}
                      onChange={(e) =>
                        update((d) => { d[ai].locations[li].numTenders = e.target.value; })
                      }
                    />
                    {fieldErrors[`tenders_${ai}_${li}`] && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors[`tenders_${ai}_${li}`]}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="field-label">
                    الموقع الجغرافي (الصق رابط الموقع المشارَك)
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="field-input"
                      placeholder="https://maps.app.goo.gl/…  أو  29.1234, 47.9876"
                      value={loc.locationLink}
                      onChange={(e) =>
                        update((d) => { d[ai].locations[li].locationLink = e.target.value; })
                      }
                    />
                    <button
                      type="button"
                      className="btn-secondary shrink-0"
                      onClick={() => resolveLocation(ai, li)}
                    >
                      رفع الموقع
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    يجب أن يكون الموقع المُدخَل ضمن نطاق 5 أمتار من الموقع الفعلي للحظيرة.
                  </p>
                  {loc.geoStatus === "loading" && (
                    <p className="mt-1 text-sm text-gray-500">جارٍ تحديد الموقع…</p>
                  )}
                  {loc.geoStatus === "error" && (
                    <p className="mt-1 text-sm text-red-600">
                      تعذّر استخراج الإحداثيات من الرابط. تأكّد من الرابط أو
                      أدخل الإحداثيات بصيغة 29.1234, 47.9876
                    </p>
                  )}
                  {fieldErrors[`geo_${ai}_${li}`] && loc.geoStatus !== "error" && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors[`geo_${ai}_${li}`]}</p>
                  )}
                  {loc.geoStatus === "ok" && loc.lat !== null && loc.lng !== null && (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-gray-700">
                        الإحداثيات: {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                      </p>
                      <MapView lat={loc.lat} lng={loc.lng} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addLocation(ai)}
              className="w-full rounded-lg border-2 border-dashed border-gov/40 py-3 text-sm font-semibold text-gov transition hover:border-gov hover:bg-gov-light"
            >
              + أضف موقع
            </button>
          </div>
        );
      })}

      <div className="card space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="pledge"
              required
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 accent-gov"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              {/* Placeholder — final wording to be supplied */}
              أُقرّ وأتعهّد بأن جميع البيانات والمعلومات الواردة في هذا الإقرار صحيحةٌ وكاملةٌ ومطابقةٌ للواقع، وأتحمّل المسؤولية القانونية الكاملة عن أي معلومات مغلوطة أو ناقصة.
            </span>
          </label>
          {fieldErrors.pledge && (
            <p className="mt-2 text-sm text-red-600">{fieldErrors.pledge}</p>
          )}
        </div>

        <SubmitButton isEditing={isEditing} />
        <p className="mt-2 text-xs text-gray-500">
          {isEditing
            ? "سيتم حفظ النسخة الحالية في سجل التغييرات قبل تطبيق التعديلات."
            : "عند الإرسال سيتم إنشاء رقم معاملة فريد يُستخدم في عملية التدقيق الميداني."}
        </p>
      </div>
    </form>
  );
}
