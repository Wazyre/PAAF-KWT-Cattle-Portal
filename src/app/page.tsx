// Entryway: sign in with a civil ID through PACI, then go to the portal that matches the ID's role in the database.
import Link from "next/link";
import { IconClipboardEdit, IconClipboardCheck, IconAlertTriangle } from "@/components/icons";
import { ENTRY_NOTICES } from "@/lib/login-messages";
import { verifyEntryLink } from "@/lib/entry-link";
import { paciMode } from "@/lib/paci";
import { ROLE_HOME, ROLE_LABEL, rolesFor, type Role } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { logout } from "./auth-actions";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

const ROLE_ICON = {
  FARMER: IconClipboardEdit,
  SUPERVISOR: IconClipboardCheck,
  HEAD: IconAlertTriangle
} as const;

export default async function HomePage(props: {
  searchParams: Promise<{ reason?: string; c?: string; k?: string }>;
}) {
  const { reason: askedReason, c, k } = await props.searchParams;
  const session = await getSession();
  // Roles come from the database, not the cookie, so a person removed from a table sees no portal here.
  const current = session ? await rolesFor(session.civilId) : null;
  const roles: Role[] = current ? current.roles.filter((r) => session!.roles.includes(r)) : [];

  // A link from a Sahel notification (?c=<civil id>&k=<signature>) starts the PACI request without typing the civil ID.
  const linked = c !== undefined || k !== undefined;
  const linkedCivilId = c && k && verifyEntryLink(c, k) ? c : undefined;
  const reason = linked && !linkedCivilId ? "bad_link" : askedReason;

  if (session && roles.length > 0) {
    return (
      <div className="space-y-6">
        <div className="card">
          <h1 className="text-xl font-bold text-gov-dark">مرحباً، {current!.name}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {reason === "denied" ? ENTRY_NOTICES.denied : "اختر البوابة:"}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => {
            const Icon = ROLE_ICON[role];
            return (
              <Link key={role} href={ROLE_HOME[role]} className="card flex flex-col gap-2 transition hover:border-gov hover:shadow-md">
                <Icon className="h-9 w-9 text-gov" />
                <span className="text-lg font-bold text-gov-dark">{ROLE_LABEL[role]}</span>
              </Link>
            );
          })}
        </div>
        <form action={logout}>
          <button type="submit" className="btn-secondary">
            تسجيل الخروج
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="card">
        <h1 className="text-xl font-bold text-gov-dark">مرحباً بكم في بوابة حصر وتدقيق المواشي</h1>
        <p className="mt-2 text-sm text-gray-600">
          أدخل رقمك المدني لتسجيل الدخول. سيتم توجيهك تلقائياً إلى البوابة الخاصة بك: مربّي مواشٍ، أو مفتش ميداني، أو رئيس المفتشين.
        </p>
      </div>
      {reason && ENTRY_NOTICES[reason] && <div className="danger-box">{ENTRY_NOTICES[reason]}</div>}
      <LoginForm mock={paciMode() === "mock"} linkedCivilId={linkedCivilId} />
    </div>
  );
}
