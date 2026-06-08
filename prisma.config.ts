import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // directUrl is supported at runtime but not yet typed in @prisma/config v7
    ...(process.env.DIRECT_URL ? { directUrl: process.env.DIRECT_URL } : {}),
  } as { url?: string },
});
