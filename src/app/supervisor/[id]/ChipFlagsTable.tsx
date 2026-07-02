"use client";

export interface ChipReadingRow {
  id: number;
  rawChip: string;
  readAt: string;
  flaggedSymbol: boolean;
  flaggedProximity: boolean;
  flaggedMultipleChips: boolean;
  flaggedDoesntBelong: boolean;
}

// Read-only table of saved chip readings with auto-computed flag notes per row.
export default function ChipFlagsTable({
  readings,
  label
}: {
  resultId: number;
  readings: ChipReadingRow[];
  label: string;
}) {
  // Compute the "original" chip for each star-flagged row (the last non-star chip before it).
  const originalChipMap = new Map<number, string>();
  let lastNonStar: string | null = null;
  for (const r of readings) {
    if (!r.flaggedSymbol) {
      lastNonStar = r.rawChip;
    } else if (lastNonStar !== null) {
      originalChipMap.set(r.id, lastNonStar);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-gov-dark">
        {label} ({readings.length} قراءة)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gov-light text-gov-dark">
              <th className="border border-gray-300 px-2 py-1">#</th>
              <th className="border border-gray-300 px-2 py-1">وقت القراءة</th>
              <th className="border border-gray-300 px-2 py-1">رقم الشريحة</th>
              <th className="border border-gray-300 px-2 py-1">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {readings.map((r, i) => {
              const anyFlag =
                r.flaggedSymbol || r.flaggedProximity || r.flaggedMultipleChips || r.flaggedDoesntBelong;
              const notes = [
                r.flaggedSymbol ? "رمز/نجمة" : "",
                r.flaggedProximity ? "تقارب زمني ≤ 5ث" : "",
                r.flaggedMultipleChips ? "أكثر من شريحة" : "",
                r.flaggedDoesntBelong ? "ليست باسم المربي" : ""
              ]
                .filter(Boolean)
                .join(" + ");
              const originalChip = originalChipMap.get(r.id);
              return (
                <tr key={r.id} className={anyFlag ? "bg-amber-50 text-center" : "text-center"}>
                  <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1">{r.readAt}</td>
                  <td className="border border-gray-300 px-2 py-1 font-mono">
                    {r.rawChip}
                    {originalChip && (
                      <div className="text-xs text-gray-500 font-normal">
                        الشريحة الأصلية: {originalChip}
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-xs">
                    {notes || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
