// The three portal roles and how a civil ID maps to them. Roles come only from the database tables that
// are loaded before go-live: Citizen (farmers), Supervisor (investigators) and HeadSupervisor (head investigators).
import { prisma } from "./prisma";

export { CIVIL_ID_PATTERN, ROLE_HOME, ROLE_LABEL, type Role } from "./role-meta";
import type { Role } from "./role-meta";


/** Whether this civil ID is a superuser (see `npm run superuser`). */
export async function isSuperuser(civilId: string): Promise<boolean> {
  return (await prisma.superuser.findUnique({ where: { civilId } })) !== null;
}

/** Every role this civil ID holds, with the name on file; null when the ID is not in any table. A superuser holds all three. */
export async function rolesFor(
  civilId: string
): Promise<{ roles: Role[]; name: string; superuser: boolean } | null> {
  const [superuser, head, supervisor, farmer] = await Promise.all([
    prisma.superuser.findUnique({ where: { civilId } }),
    prisma.headSupervisor.findUnique({ where: { civilId } }),
    prisma.supervisor.findUnique({ where: { civilId } }),
    prisma.citizen.findUnique({ where: { civilId } })
  ]);
  if (superuser) return { roles: ["FARMER", "SUPERVISOR", "HEAD"], name: superuser.name, superuser: true };
  const roles: Role[] = [];
  if (head) roles.push("HEAD");
  if (supervisor) roles.push("SUPERVISOR");
  if (farmer) roles.push("FARMER");
  if (roles.length === 0) return null;
  return { roles, name: (head ?? supervisor ?? farmer)!.name, superuser: false };
}
