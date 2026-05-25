"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import dynamic from "next/dynamic";
import {
  GATHERING_POINTS,
  ANIMAL_TYPES
} from "@/lib/constants";
import { IconAlertTriangle } from "@/components/icons";
import { isValidKuwaitMobile, KUWAIT_MOBILE_ERROR } from "@/lib/phone";
import { submitDeclaration } from "./actions";

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
    <button
      type="submit"
      className="btn-primary w-full sm:w-auto"
      disabled={pending}
    >
      {pending
        ? isEditing
          ? "جارٍ التحديث…"
          : "جارٍ الإرسال…"
        : isEditing
        ? "تحديث الإقرار"
        : "إرسال الإقرار"}
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
  gatheringPoint: string;
  locationLink: string;
  lat: number | null;
  lng: number | null;
  geoStatus: "" | "loading" | "ok" | "error";
  chippedCount: string;
  males: string;
  females: string;
  numTenders: string;
}

interface AnimalTypeGroup {
  animalType: string;
  locations: LocationRow[];
}

function emptyLocation(): LocationRow {
  return {
    gatheringPoint: "",
    locationLink: "",
    lat: null,
    lng: null,
    geoStatus: "",
    chippedCount: "",
    males: "",
    females: "",
    numTenders: ""
  };
}

function emptyGroup(): AnimalTypeGroup {
  return { animalType: "", locations: [emptyLocation()] };
}

function fromInitialData(data: InitialData): AnimalTypeGroup[] {
  return data.animalGroups.map((g) => ({
    animalType: g.animalType,
    locations: g.locations.map((l) => ({
      gatheringPoint: l.gatheringPoint,
      locationLink: l.locationLink,
      lat: l.latitude,
      lng: l.longitude,
      geoStatus: "ok" as const,
      chippedCount: String(l.chippedCount),
      males: String(l.males),
      females: String(l.females),
      numTenders: String(l.numTenders)
    }))
  }));
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

  const [animalGroups, setAnimalGroups] = useState<AnimalTypeGroup[]>(
    initialData && initialData.animalGroups.length > 0
      ? fromInitialData(initialData)
      : [emptyGroup()]
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");

  function validateAll(mobile: string): string[] {
    const errs: string[] = [];
    if (!mobile.trim()) errs.push("يرجى إدخال رقم الهاتف الشخصي.");
    else if (!isValidKuwaitMobile(mobile)) errs.push(KUWAIT_MOBILE_ERROR);

    animalGroups.forEach((g, gi) => {
      const typeLabel = `النوع ${gi + 1}`;
      if (!g.animalType) errs.push(`${typeLabel}: يرجى اختيار نوع الحيوان.`);

      g.locations.forEach((loc, li) => {
        const where = `${typeLabel} / الموقع ${li + 1}`;
        if (!loc.gatheringPoint)
          errs.push(`${where}: يرجى اختيار نقطة التجمّع.`);
        const chipped = intStr(loc.chippedCount);
        const males = intStr(loc.males);
        const females = intStr(loc.females);
        const tenders = intStr(loc.numTenders);
        if (chipped === null)
          errs.push(`${where}: يرجى إدخال عدد الحيوانات المُرقّمة.`);
        else if (Number.isNaN(chipped))
          errs.push(`${where}: عدد الحيوانات المُرقّمة غير صحيح.`);
        if (males === null) errs.push(`${where}: يرجى إدخال عدد الذكور.`);
        else if (Number.isNaN(males))
          errs.push(`${where}: عدد الذكور غير صحيح.`);
        if (females === null) errs.push(`${where}: يرجى إدخال عدد الإناث.`);
        else if (Number.isNaN(females))
          errs.push(`${where}: عدد الإناث غير صحيح.`);
        if (tenders === null)
          errs.push(`${where}: يرجى إدخال عدد العمال/الرعاة.`);
        else if (Number.isNaN(tenders))
          errs.push(`${where}: عدد العمال/الرعاة غير صحيح.`);
        if (
          typeof chipped === "number" &&
          !Number.isNaN(chipped) &&
          typeof males === "number" &&
          !Number.isNaN(males) &&
          typeof females === "number" &&
          !Number.isNaN(females) &&
          males + females !== chipped
        ) {
          errs.push(
            `${where}: مجموع الذكور والإناث يجب أن يساوي عدد الحيوانات المُرقّمة.`
          );
        }
        if (loc.lat === null || loc.lng === null)
          errs.push(
            `${where}: يرجى تحديد الموقع الجغرافي بدقة (اضغط "رفع الموقع").`
          );
      });
    });

    return errs;
  }

  async function action(fd: FormData) {
    const mobile = String(fd.get("mobile") ?? "");
    const errs = validateAll(mobile);
    setErrors(errs);
    setServerError("");
    if (errs.length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const res = await submitDeclaration({}, fd);
    if (res?.error) {
      setServerError(res.error);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function update(mutator: (draft: AnimalTypeGroup[]) => void) {
    setAnimalGroups((prev) => {
      const next = structuredClone(prev);
      mutator(next);
      return next;
    });
  }

  async function resolveLocation(gi: number, li: number) {
    const link = animalGroups[gi].locations[li].locationLink.trim();
    if (!link) return;
    update((d) => {
      d[gi].locations[li].geoStatus = "loading";
    });
    try {
      const res = await fetch(
        `/api/resolve-location?u=${encodeURIComponent(link)}`
      );
      if (!res.ok) throw new Error("unresolved");
      const data = (await res.json()) as { lat: number; lng: number };
      update((d) => {
        d[gi].locations[li].lat = data.lat;
        d[gi].locations[li].lng = data.lng;
        d[gi].locations[li].geoStatus = "ok";
      });
    } catch {
      update((d) => {
        d[gi].locations[li].lat = null;
        d[gi].locations[li].lng = null;
        d[gi].locations[li].geoStatus = "error";
      });
    }
  }

  const payload = JSON.stringify(
    animalGroups.map((g) => ({
      animalType: g.animalType,
      locations: g.locations.map((l) => ({
        gatheringPoint: l.gatheringPoint,
        locationLink: l.locationLink,
        lat: l.lat,
        lng: l.lng,
        chippedCount: l.chippedCount,
        males: l.males,
        females: l.females,
        numTenders: l.numTenders
      }))
    }))
  );

  const allErrors = [...errors, ...(serverError ? [serverError] : [])];

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="civilId" value={civilId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="payload" value={payload} />

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
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gov-dark">
          أنواع المواشي ({animalGroups.length})
        </h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setAnimalGroups((p) => [...p, emptyGroup()])}
        >
          + إضافة نوع
        </button>
      </div>

      {animalGroups.map((g, gi) => (
        <div key={gi} className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gov-dark">النوع {gi + 1}</h3>
            {animalGroups.length > 1 && (
              <button
                type="button"
                className="text-sm font-semibold text-red-600"
                onClick={() =>
                  setAnimalGroups((p) => p.filter((_, idx) => idx !== gi))
                }
              >
                حذف النوع
              </button>
            )}
          </div>

          <div>
            <label className="field-label">نوع الحيوان</label>
            <select
              className="field-input"
              value={g.animalType}
              onChange={(e) =>
                update((d) => {
                  d[gi].animalType = e.target.value;
                })
              }
            >
              <option value="">— اختر —</option>
              {ANIMAL_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="field-label mb-0">مواقع الحظائر</label>
              <button
                type="button"
                className="text-sm font-semibold text-gov"
                onClick={() =>
                  update((d) => {
                    d[gi].locations.push(emptyLocation());
                  })
                }
              >
                + إضافة موقع
              </button>
            </div>

            {g.locations.map((loc, li) => (
              <div
                key={li}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    الموقع {li + 1}
                  </span>
                  {g.locations.length > 1 && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600"
                      onClick={() =>
                        update((d) => {
                          d[gi].locations = d[gi].locations.filter(
                            (_, idx) => idx !== li
                          );
                        })
                      }
                    >
                      حذف
                    </button>
                  )}
                </div>

                <div>
                  <label className="field-label">نقطة التجمّع</label>
                  <select
                    className="field-input"
                    value={loc.gatheringPoint}
                    onChange={(e) =>
                      update((d) => {
                        d[gi].locations[li].gatheringPoint = e.target.value;
                      })
                    }
                  >
                    <option value="">— اختر —</option>
                    {GATHERING_POINTS.map((gp) => (
                      <option key={gp.value} value={gp.value}>
                        {gp.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">
                      عدد الحيوانات المُرقّمة (تحمل شريحة)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="field-input"
                      value={loc.chippedCount}
                      onChange={(e) =>
                        update((d) => {
                          d[gi].locations[li].chippedCount = e.target.value;
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">عدد الذكور</label>
                      <input
                        type="number"
                        min={0}
                        className="field-input"
                        value={loc.males}
                        onChange={(e) =>
                          update((d) => {
                            d[gi].locations[li].males = e.target.value;
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">عدد الإناث</label>
                      <input
                        type="number"
                        min={0}
                        className="field-input"
                        value={loc.females}
                        onChange={(e) =>
                          update((d) => {
                            d[gi].locations[li].females = e.target.value;
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="field-label">عدد العمال / الرعاة</label>
                    <input
                      type="number"
                      min={0}
                      className="field-input"
                      value={loc.numTenders}
                      onChange={(e) =>
                        update((d) => {
                          d[gi].locations[li].numTenders = e.target.value;
                        })
                      }
                    />
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
                        update((d) => {
                          d[gi].locations[li].locationLink = e.target.value;
                        })
                      }
                    />
                    <button
                      type="button"
                      className="btn-secondary shrink-0"
                      onClick={() => resolveLocation(gi, li)}
                    >
                      رفع الموقع
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    يجب أن يكون الموقع المُدخَل ضمن نطاق 5 أمتار من الموقع الفعلي للحظيرة.
                  </p>
                  {loc.geoStatus === "loading" && (
                    <p className="mt-1 text-sm text-gray-500">
                      جارٍ تحديد الموقع…
                    </p>
                  )}
                  {loc.geoStatus === "error" && (
                    <p className="mt-1 text-sm text-red-600">
                      تعذّر استخراج الإحداثيات من الرابط. تأكّد من الرابط أو
                      أدخل الإحداثيات بصيغة 29.1234, 47.9876
                    </p>
                  )}
                  {loc.geoStatus === "ok" &&
                    loc.lat !== null &&
                    loc.lng !== null && (
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
          </div>
        </div>
      ))}

      <div className="card">
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
