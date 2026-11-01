// Investigator portal (also serves the shared audit and print pages the head investigator opens): investigators and heads only.
import { requireRole } from "@/lib/session";

export default async function SupervisorLayout({ children }: { children: React.ReactNode }) {
  await requireRole("SUPERVISOR", "HEAD");
  return children;
}
