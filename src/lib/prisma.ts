// PrismaClient singleton (Prisma 7 + pg driver adapter), reused across hot reloads to avoid exhausting DB connections in dev.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Prisma's "?schema=" URL parameter is not understood by pg, so it is passed to the adapter instead.
// With no DATABASE_URL (e.g. during `next build`) the pool is created but never connects.
function createClient() {
  let connectionString = process.env.DATABASE_URL;
  let schema: string | undefined;
  if (connectionString) {
    const url = new URL(connectionString);
    schema = url.searchParams.get("schema") ?? undefined;
    url.searchParams.delete("schema");
    connectionString = url.toString();
  }
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }, { schema });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
