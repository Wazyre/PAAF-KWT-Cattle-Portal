"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import dynamic from "next/dynamic";
import {
  GATHERING_POINTS,
  ANIMAL_TYPES
} from "@/lib/constants";
import { submitDeclaration, type DeclarationState } from "./actions";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[240px] place-items-center rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-500">
      جارٍ تحميل الخريطة…
    </div>
  )
});

interface AnimalRow {
  animalType: string;
  chippedCount: string;
  males: string;
  females: string;
}

interface LocationRow {
  gatheringPoint: string;
  animals: AnimalRow[];
  numTenders: string;
  locationLink: string;
  lat: number | null;
  lng: number | null;
  geoStatus: "" | "loading" | "ok" | "error";
}

function emptyAnimal(): AnimalRow {
  return { animalType: "", chippedCount: "", males: "", females: "" };
}

function emptyLocation(): LocationRow {
  return {
    gatheringPoint: "",
    animals: [emptyAnimal()],
    numTenders: "",
    locationLink: "",
    lat: null,
    lng: null,
    geoStatus: ""
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? "جارٍ الإرسال…" : "إرسال الإقرار"}
    </button>
  );
}

export default function DeclarationForm({
  civilId,
  name
}: {
  civilId: string;
  name: string;
}) {
  const [locations, setLocations] = useState<LocationRow[]>([emptyLocation()]);
  const [state, formAction] = useFormState<DeclarationState, FormData>(
    submitDeclaration,
    {}
  );

  function update(mutator: (draft: LocationRow[]) => void) {
    setLocations((prev) => {
      const next = structuredClone(prev);
      mutator(next);
      return next;
    });
  }

  async function resolveLocation(i: number) {
    const link = locations[i].locationLink.trim();
    if (!link) return;
    update((d) => {
      d[i].geoStatus = "loading";
    });
    try {
      const res = await fetch(
        `/api/resolve-location?u=${encodeURIComponent(link)}`
      );
      if (!res.ok) throw new Error("unresolved");
      const data = (await res.json()) as { lat: number; lng: number };
      update((d) => {
        d[i].lat = data.lat;
        d[i].lng = data.lng;
        d[i].geoStatus = "ok";
      });
    } catch {
      update((d) => {
        d[i].lat = null;
        d[i].lng = null;
        d[i].geoStatus = "error";
      });
    }
  }

  // Strip transient UI fields before sending to the server.
  const payload = JSON.stringify(
    locations.map((l) => ({
      gatheringPoint: l.gatheringPoint,
      numTenders: l.numTenders,
      locationLink: l.locationLink,
      lat: l.lat,
      lng: l.lng,
      animals: l.animals
    }))
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="civilId" value={civilId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="payload" value={payload} />

      {state.error && <div className="danger-box">{state.error}</div>}

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
            رقم الهاتف الشخصي لمربّي الأغنام
          </label>
          <input
            id="mobile"
            name="mobile"
            inputMode="numeric"
            className="field-input"
            placeholder="مثال: 9XXXXXXX"
            required
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gov-dark">
          مواقع الحظائر ({locations.length})
        </h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setLocations((p) => [...p, emptyLocation()])}
        >
          + إضافة موقع
        </button>
      </div>

      {locations.map((loc, i) => (
        <div key={i} className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gov-dark">الموقع رقم {i + 1}</h3>
            {locations.length > 1 && (
              <button
                type="button"
                className="text-sm font-semibold text-red-600"
                onClick={() =>
                  setLocations((p) => p.filter((_, idx) => idx !== i))
                }
              >
                حذف الموقع
              </button>
            )}
          </div>

          <div>
            <label className="field-label">يتبع أي نقطة تجمّع</label>
            <select
              className="field-input"
              value={loc.gatheringPoint}
              onChange={(e) =>
                update((d) => {
                  d[i].gatheringPoint = e.target.value;
                })
              }
              required
            >
              <option value="">— اختر —</option>
              {GATHERING_POINTS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="field-label mb-0">أنواع الحيوانات</label>
              <button
                type="button"
                className="text-sm font-semibold text-gov"
                onClick={() =>
                  update((d) => {
                    d[i].animals.push(emptyAnimal());
                  })
                }
              >
                + إضافة نوع
              </button>
            </div>
            {loc.animals.map((an, j) => (
              <div
                key={j}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    النوع {j + 1}
                  </span>
                  {loc.animals.length > 1 && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600"
                      onClick={() =>
                        update((d) => {
                          d[i].animals = d[i].animals.filter(
                            (_, idx) => idx !== j
                          );
                        })
                      }
                    >
                      حذف
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="field-label">نوع الحيوان</label>
                    <select
                      className="field-input"
                      value={an.animalType}
                      onChange={(e) =>
                        update((d) => {
                          d[i].animals[j].animalType = e.target.value;
                        })
                      }
                      required
                    >
                      <option value="">— اختر —</option>
                      {ANIMAL_TYPES.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">
                      عدد الحيوانات المُرقّمة (تحمل شريحة)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="field-input"
                      value={an.chippedCount}
                      onChange={(e) =>
                        update((d) => {
                          d[i].animals[j].chippedCount = e.target.value;
                        })
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">عدد الذكور</label>
                      <input
                        type="number"
                        min={0}
                        className="field-input"
                        value={an.males}
                        onChange={(e) =>
                          update((d) => {
                            d[i].animals[j].males = e.target.value;
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label">عدد الإناث</label>
                      <input
                        type="number"
                        min={0}
                        className="field-input"
                        value={an.females}
                        onChange={(e) =>
                          update((d) => {
                            d[i].animals[j].females = e.target.value;
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="field-label">عدد العمال / الرعاة</label>
            <input
              type="number"
              min={0}
              className="field-input"
              value={loc.numTenders}
              onChange={(e) =>
                update((d) => {
                  d[i].numTenders = e.target.value;
                })
              }
              required
            />
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
                    d[i].locationLink = e.target.value;
                  })
                }
              />
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => resolveLocation(i)}
              >
                عرض الموقع
              </button>
            </div>
            {loc.geoStatus === "loading" && (
              <p className="mt-1 text-sm text-gray-500">جارٍ تحديد الموقع…</p>
            )}
            {loc.geoStatus === "error" && (
              <p className="mt-1 text-sm text-red-600">
                تعذّر استخراج الإحداثيات من الرابط. تأكّد من الرابط أو أدخل
                الإحداثيات بصيغة 29.1234, 47.9876
              </p>
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

      <div className="card">
        <SubmitButton />
        <p className="mt-2 text-xs text-gray-500">
          عند الإرسال سيتم إنشاء رقم معاملة فريد يُستخدم في عملية التدقيق
          الميداني.
        </p>
      </div>
    </form>
  );
}
