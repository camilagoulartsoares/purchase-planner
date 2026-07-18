import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.databaseUrl,
    },
  },
  log:
    env.nodeEnv === "production"
      ? ["error", "warn"]
      : ["query", "info", "warn", "error"],
});

export async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
}
