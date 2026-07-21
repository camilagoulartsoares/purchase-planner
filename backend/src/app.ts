import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./config/prisma.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { authRoutes } from "./routes/authRoutes.js";
import { productRoutes } from "./routes/productRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { brandRoutes } from "./routes/brandRoutes.js";
import { integrationRoutes } from "./routes/integrationRoutes.js";
import { uploadsDir } from "./services/imageService.js";
import { backupService } from "./services/backupService.js";
import { cloudinaryConfigured } from "./config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  const isLocalDevOrigin = (origin: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  const allowedOrigins = new Set(
    [
      env.frontendUrl,
      ...(process.env.FRONTEND_URLS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ].filter(Boolean),
  );

  const isAllowedOrigin = (origin: string) => {
    if (allowedOrigins.has(origin)) return true;
    if (env.nodeEnv !== "production" && isLocalDevOrigin(origin)) return true;
    try {
      if (/\.vercel\.app$/i.test(new URL(origin).hostname)) return true;
    } catch {
      return false;
    }
    return false;
  };

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS bloqueado para origem: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/uploads", express.static(uploadsDir));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 2000,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) =>
        req.method === "OPTIONS" ||
        req.path.startsWith("/api/health") ||
        req.path.startsWith("/uploads"),
      message: {
        success: false,
        message: "Muitas requisições em pouco tempo. Aguarde alguns segundos e tente novamente.",
      },
    }),
  );

  app.get("/api/health", async (_req, res) => {
    try {
      await checkDatabaseConnection();
      return res.json({
        success: true,
        data: {
          status: "ok",
          persistence: {
            database: "connected",
            photos: cloudinaryConfigured() ? "cloudinary" : "disk-volume",
            dataDir: "backend/data",
            backupsDir: "backend/backups",
          },
        },
      });
    } catch (error) {
      console.error("[health] falha ao validar /api/health", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return res.status(503).json({
        success: false,
        data: {
          status: "degraded",
          persistence: {
            database: "disconnected",
            photos: cloudinaryConfigured() ? "cloudinary" : "disk-volume",
            dataDir: "backend/data",
            backupsDir: "backend/backups",
          },
        },
        error: error instanceof Error ? error.message : "Database unavailable",
      });
    }
  });

  app.get("/api/health/db", async (_req, res) => {
    try {
      await checkDatabaseConnection();
      return res.json({
        success: true,
        database: "connected",
      });
    } catch (error) {
      console.error("[health] falha ao validar /api/health/db", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return res.status(503).json({
        success: false,
        error: error instanceof Error ? error.message : "Database unavailable",
      });
    }
  });

  app.post("/api/backup", (_req, res) => {
    try {
      const folder = backupService.create("api");
      res.json({ success: true, data: { folder } });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err instanceof Error ? err.message : "Falha no backup",
      });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/brands", brandRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/integrations", integrationRoutes);

  void __dirname;

  app.use(errorHandler);
  return app;
}
