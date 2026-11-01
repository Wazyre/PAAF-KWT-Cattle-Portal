// Head investigator portal: head investigators only.
import { requireRole } from "@/lib/session";

export default async function HeadSupervisorLayout({ children }: { children: React.ReactNode }) {
  await requireRole("HEAD");
  return children;
}
