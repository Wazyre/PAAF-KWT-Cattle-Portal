// Resolves a Civil ID to a citizen name. Integration seam for the future Sahel/PACI SSO swap.
import { prisma } from "./prisma";

export interface ResolvedIdentity {
  civilId: string;
  name: string;
}

/**
 * Resolve a Civil ID to a citizen name.
 *
 * INTEGRATION SEAM: today this reads the seeded Citizen table. To go live
 * with Kuwait Sahel/PACI SSO, replace the body of this function with a call
 * to the national identity service — nothing else in the app needs to change.
 */
export async function resolveIdentity(
  civilId: string
): Promise<ResolvedIdentity | null> {
  const id = civilId.trim();
  if (!/^\d{12}$/.test(id)) return null;
  const citizen = await prisma.citizen.findUnique({ where: { civilId: id } });
  if (!citizen) return null;
  return { civilId: citizen.civilId, name: citizen.name };
}
