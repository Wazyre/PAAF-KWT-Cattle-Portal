// Prisma 7 config: connection URL and seed command live here instead of schema.prisma / package.json.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    // `prisma generate` runs without a database (e.g. in the Docker build), so don't fail when unset.
    url: process.env.DATABASE_URL ?? ""
  }
});
