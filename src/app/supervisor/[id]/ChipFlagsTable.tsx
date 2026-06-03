"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateChipFlags } from "./actions";

export interface ChipReadingRow {
  id: number;
  rawChip: string;
  readAt: string;
  flaggedSymbol: boolean;
  flaggedProximity: boolean;
  flaggedMultipleChips: boolean;
  flaggedDoesntBelong: boolean;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "جارٍ الحفظ…" : "حفظ التصنيف"}
    </button>
  );
}

export default function ChipFlagsTable({
  resultId,
  readings,
  label
}: {
  resultId: number;
  readings: ChipReadingRow[];
  label: string;
}) {
  type FlagMap = Map<number, { mc: boolean; db: boolean }>;

  const [flags, setFlags] = useState<FlagMap>(() => {
    const m: FlagMap = new Map();
    for (const r of readings) {
      m.set(r.id, { mc: r.flaggedMultipleChips, db: r.flaggedDoesntBelong });
    }
    return m;
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const flagsPayload = JSON.stringify(
    readings.map((r) => ({
      id: r.id,
      multipleChips: flags.get(r.id)?.mc ?? false,
      doesntBelong: flags.get(r.id)?.db ?? false
    }))
  );

  async function action(fd: FormData) {
    setSaveError("");
    const res = await updateChipFlags({}, fd);
    if (res?.error) {
      setSaveError(res.error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  function toggleMc(id: number, checked: boolean) {
    setFlags((prev) => {
      const next = new Map(prev);
      const f = next.get(id) ?? { mc: false, db: false };
      next.set(id, { ...f, mc: checked });
      return next;
    });
  }

  function toggleDb(id: number, checked: boolean) {
    setFlags((prev) => {
      const next = new Map(prev);
      const f = next.get(id) ?? { mc: false, db: false };
      next.set(id, { ...f, db: checked });
      return next;
    });
  }

  return (
    <form action={action} className="space-y-2">
      <h3 className="font-semibold text-gov-dark">
        {label} ({readings.length} قراءة)
      </h3>
      <input type="hidden" name="resultId" value={resultId} />
      <input type="hidden" name="flagsPayload" value={flagsPayload} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gov-light text-gov-dark">
              <th className="border border-gray-300 px-2 py-1">#</th>
              <th className="border border-gray-300 px-2 py-1">وقت القراءة</th>
              <th className="border border-gray-300 px-2 py-1">رقم الشريحة</th>
              <th className="border border-gray-300 px-2 py-1">تنبيهات تلقائية</th>
              <th className="border border-gray-300 px-2 py-1 text-xs leading-tight">
                يحمل أكثر من شريحة
              </th>
              <th className="border border-gray-300 px-2 py-1 text-xs leading-tight">
                ليست باسم المربي
              </th>
            </tr>
          </thead>
          <tbody>
            {readings.map((r, i) => {
              const f = flags.get(r.id) ?? { mc: false, db: false };
              const anyFlag = r.flaggedSymbol || r.flaggedProximity || f.mc || f.db;
              const autoNotes = [
                r.flaggedSymbol ? "رمز/نجمة" : "",
                r.flaggedProximity ? "تقارب زمني ≤ 5ث" : ""
              ]
                .filter(Boolean)
                .join(" + ");
              return (
                <tr key={r.id} className={anyFlag ? "bg-amber-50 text-center" : "text-center"}>
                  <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1">{r.readAt}</td>
                  <td className="border border-gray-300 px-2 py-1 font-mono">{r.rawChip}</td>
                  <td className="border border-gray-300 px-2 py-1 text-xs">
                    {autoNotes || "—"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    <input
                      type="checkbox"
                      checked={f.mc}
                      onChange={(e) => toggleMc(r.id, e.target.checked)}
                      className="h-4 w-4 accent-gov"
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    <input
                      type="checkbox"
                      checked={f.db}
                      onChange={(e) => toggleDb(r.id, e.target.checked)}
                      className="h-4 w-4 accent-gov"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <SaveButton />
        {saved && (
          <span className="text-sm font-semibold text-green-700">تم الحفظ ✓</span>
        )}
        {saveError && (
          <span className="text-sm font-semibold text-red-600">{saveError}</span>
        )}
      </div>
    </form>
  );
}
