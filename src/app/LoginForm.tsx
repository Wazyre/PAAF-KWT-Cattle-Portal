"use client";
// Entryway form: sends the civil ID, waits for the person to approve the request in the PACI app, then opens their portal.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_HOME, ROLE_LABEL, type Role } from "@/lib/role-meta";
import { OUTCOME_ERRORS, START_ERRORS } from "@/lib/login-messages";

type Phase = "idle" | "sending" | "waiting" | "choose";

// Arabic-Indic and Persian digits become ASCII so the number can be typed on any keyboard.
function normalizeDigits(v: string): string {
  return v
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, "");
}

export default function LoginForm({ mock }: { mock: boolean }) {
  const router = useRouter();
  const [civilId, setCivilId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [roles, setRoles] = useState<Role[]>([]);
  const cancelled = useRef(false);

  useEffect(() => () => void (cancelled.current = true), []);

  function fail(message: string) {
    setError(message);
    setPhase("idle");
  }

  async function poll(attempt: string, expiresIn: number) {
    const deadline = Date.now() + (expiresIn + 5) * 1000;
    while (!cancelled.current) {
      setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000) - 5));
      if (Date.now() > deadline) return fail(OUTCOME_ERRORS.EXPIRED);
      await new Promise((r) => setTimeout(r, 2000));
      if (cancelled.current) return;
      let data: { status?: string; roles?: Role[]; message?: string };
      try {
        const res = await fetch(`/api/auth/status?attempt=${encodeURIComponent(attempt)}`, { cache: "no-store" });
        data = await res.json();
      } catch {
        continue; // a dropped request: keep waiting, the next poll will tell
      }
      if (data.status === "PENDING") continue;
      if (data.status === "APPROVED" && data.roles?.length) {
        if (data.roles.length === 1) {
          router.replace(ROLE_HOME[data.roles[0]]);
          router.refresh();
          return;
        }
        setRoles(data.roles);
        setPhase("choose");
        router.refresh();
        return;
      }
      return fail(data.message ?? OUTCOME_ERRORS[data.status ?? "UNKNOWN"] ?? OUTCOME_ERRORS.UNKNOWN);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const id = normalizeDigits(civilId);
    if (!/^\d{12}$/.test(id)) return fail(START_ERRORS.invalid);

    cancelled.current = false;
    setPhase("sending");
    let res: Response;
    try {
      res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ civilId: id })
      });
    } catch {
      return fail(START_ERRORS.network);
    }
    const data = await res.json().catch(() => null);
    if (!data) return fail(`${START_ERRORS.bad_response} (HTTP ${res.status})`);
    if (!res.ok || !data.attempt) return fail(data.message ?? START_ERRORS[data.error] ?? `${START_ERRORS.server_error} (HTTP ${res.status})`);

    setSecondsLeft(data.expiresIn);
    setPhase("waiting");
    void poll(data.attempt, data.expiresIn);
  }

  function cancel() {
    cancelled.current = true;
    setPhase("idle");
    setError(null);
  }

  if (phase === "choose") {
    return (
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-gov-dark">تم التحقق من هويتك</h2>
        <p className="text-sm text-gray-600">رقمك المدني مسجّل في أكثر من بوابة. اختر البوابة التي تريد الدخول إليها:</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          {roles.map((r) => (
            <Link key={r} href={ROLE_HOME[r]} className="btn-primary text-center">
              {ROLE_LABEL[r]}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="card space-y-4 text-center" role="status" aria-live="polite">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gov-light border-t-gov" />
        <h2 className="text-lg font-bold text-gov-dark">بانتظار موافقتك</h2>
        <p className="text-sm text-gray-600">
          تم إرسال طلب إلى تطبيق الهوية الرقمية على هاتفك. افتح التطبيق ووافق على الطلب لإكمال الدخول.
        </p>
        <p className="text-xs text-gray-500">تنتهي المهلة خلال {secondsLeft} ثانية</p>
        {mock && <p className="text-xs text-amber-700">وضع تجريبي: ستتم الموافقة تلقائياً خلال ثوانٍ.</p>}
        <button type="button" onClick={cancel} className="btn-secondary">
          إلغاء
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4" noValidate>
      <div>
        <label className="field-label" htmlFor="civilId">
          الرقم المدني
        </label>
        <input
          id="civilId"
          name="civilId"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          className="field-input"
          placeholder="12 رقماً"
          value={civilId}
          onChange={(e) => setCivilId(e.target.value)}
          disabled={phase === "sending"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          autoFocus
          required
        />
      </div>

      {error && (
        <div id="login-error" className="danger-box" role="alert">
          {error}
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={phase === "sending"}>
        {phase === "sending" ? "جارٍ إرسال الطلب…" : "دخول بالهوية الرقمية"}
      </button>
      <p className="text-xs text-gray-500">
        سيصلك طلب تأكيد على تطبيق الهوية الرقمية (PACI). بعد الموافقة تُفتح لك البوابة المناسبة لحسابك تلقائياً.
      </p>
      {mock && (
        <p className="rounded-sm bg-amber-50 p-2 text-xs text-amber-800">
          وضع تجريبي (PACI_MODE=mock): لا يُرسل أي طلب حقيقي. الرقم المنتهي بـ 9 يُرفض، والمنتهي بـ 8 لا يردّ، وغير ذلك يُقبل بعد ثوانٍ.
        </p>
      )}
    </form>
  );
}
