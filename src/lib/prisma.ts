// ============================================================
// lib/prisma.ts — Prisma Client Singleton for Next.js
//
// Why this pattern?
// Next.js hot-reload in development creates new module instances
// on every file change, which would exhaust the PostgreSQL
// connection pool. We store the client on `globalThis` so it
// survives module reloads in dev, while production always gets
// a single fresh instance.
// ============================================================

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
