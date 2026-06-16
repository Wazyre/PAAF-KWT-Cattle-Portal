"use client";
// Supervisor + visit-date controls for one farmer group; auto-submits assignGroup on change of either field.

import { useRef, useState, useTransition } from "react";
import { assignGroup } from "./actions";

// Supervisor select plus visit-date input for one group; auto-submits assignGroup whenever either field changes.
export default function AssignControl({
  animalType,
  gatheringPoint,
  groupType,
  soloDeclarationId,
  supervisors,
  currentSupervisorId,
  currentScheduledDate
}: {
  animalType: string;
  gatheringPoint: string;
  groupType: string;
  soloDeclarationId?: number;
  supervisors: { id: number; name: string }[];
  currentSupervisorId: number | null;
  currentScheduledDate: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [supervisorId, setSupervisorId] = useState<string>(
    currentSupervisorId != null ? String(currentSupervisorId) : ""
  );
  const [scheduledDate, setScheduledDate] = useState<string>(
    currentScheduledDate ?? ""
  );

  const submit = () =>
    startTransition(() => formRef.current?.requestSubmit());

  return (
    <form ref={formRef} action={assignGroup} className="flex items-center gap-2">
      <input type="hidden" name="animalType" value={animalType} />
      <input type="hidden" name="gatheringPoint" value={gatheringPoint} />
      <input type="hidden" name="groupType" value={groupType} />
      {soloDeclarationId != null && (
        <input type="hidden" name="soloDeclarationId" value={soloDeclarationId} />
      )}
      <select
        name="supervisorId"
        value={supervisorId}
        disabled={isPending}
        onChange={(e) => {
          setSupervisorId(e.target.value);
          submit();
        }}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-gov focus:outline-none disabled:opacity-60"
      >
        <option value="">— غير مُسنَد —</option>
        {supervisors.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="scheduledDate"
        value={scheduledDate}
        disabled={isPending || supervisorId === ""}
        onChange={(e) => {
          setScheduledDate(e.target.value);
          if (supervisorId !== "") submit();
        }}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-gov focus:outline-none disabled:opacity-60"
      />
      {isPending && (
        <span className="text-xs text-gray-400">جارٍ الحفظ…</span>
      )}
    </form>
  );
}
