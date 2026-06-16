"use client";
// Roster management for supervisors: list with delete buttons and an inline add form (Civil ID + name).

import { useFormState, useFormStatus } from "react-dom";
import { addSupervisor, removeSupervisor, type ActionState } from "./actions";

// Submit button for the add-supervisor form, showing a pending label via useFormStatus.
function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary text-sm disabled:opacity-60"
    >
      {pending ? "جارٍ الإضافة…" : "إضافة مفتش"}
    </button>
  );
}

// Supervisor roster: lists current supervisors with delete buttons, plus an inline add form for Civil ID and name.
export default function SupervisorManager({
  supervisors
}: {
  supervisors: { id: number; name: string; civilId: string }[];
}) {
  const [state, addAction] = useFormState<ActionState, FormData>(addSupervisor, {});

  return (
    <div className="card space-y-4">
      <h2 className="font-bold text-gov-dark">إدارة المفتشين</h2>

      {supervisors.length === 0 ? (
        <p className="text-sm text-gray-500">لا يوجد مفتشون مسجّلون بعد.</p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {supervisors.map((s) => (
            <form
              key={s.id}
              action={removeSupervisor}
              className="flex items-center justify-between px-4 py-2"
            >
              <div>
                <span className="text-sm font-semibold text-gray-800">{s.name}</span>
                <span className="mr-2 font-mono text-xs text-gray-500">{s.civilId}</span>
              </div>
              <input type="hidden" name="supervisorId" value={s.id} />
              <button
                type="submit"
                className="text-xs font-semibold text-red-600 transition-colors hover:text-red-800"
              >
                حذف
              </button>
            </form>
          ))}
        </div>
      )}

      <form
        action={addAction}
        className="flex flex-wrap items-end gap-3 border-t border-gray-200 pt-4"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">الرقم المدني (12 رقماً)</label>
          <input
            name="civilId"
            type="text"
            inputMode="numeric"
            maxLength={12}
            placeholder="XXXXXXXXXXXX"
            className="w-40 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-gov focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">الاسم</label>
          <input
            name="name"
            type="text"
            placeholder="اسم المفتش"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-gov focus:outline-none"
          />
        </div>
        <AddButton />
        {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      </form>
    </div>
  );
}
