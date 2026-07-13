import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { authRoutes } from "./routes/authRoutes.js";
import { productRoutes } from "./routes/productRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    }),
  );
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" } });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/dashboard", dashboardRoutes);

  app.use(errorHandler);
  return app;
}
