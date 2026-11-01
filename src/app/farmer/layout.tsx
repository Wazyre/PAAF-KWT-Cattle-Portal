// Farmer portal: signed-in farmers only.
import { requireRole } from "@/lib/session";

export default async function FarmerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("FARMER");
  return children;
}
