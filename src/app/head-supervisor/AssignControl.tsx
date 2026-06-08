"use client";

import { useRef, useTransition } from "react";
import { assignGroup } from "./actions";

export default function AssignControl({
  animalType,
  gatheringPoint,
  groupType,
  soloDeclarationId,
  supervisors,
  currentSupervisorId
}: {
  animalType: string;
  gatheringPoint: string;
  groupType: string;
  soloDeclarationId?: number;
  supervisors: { id: number; name: string }[];
  currentSupervisorId: number | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

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
        defaultValue={currentSupervisorId ?? ""}
        disabled={isPending}
        onChange={() =>
          startTransition(() => formRef.current?.requestSubmit())
        }
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-gov focus:outline-none disabled:opacity-60"
      >
        <option value="">— غير مُسنَد —</option>
        {supervisors.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {isPending && (
        <span className="text-xs text-gray-400">جارٍ الحفظ…</span>
      )}
    </form>
  );
}
