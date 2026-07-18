import type { NextFunction, Request, Response } from "express";
import { authService } from "../services/authService.js";
import { loginSchema, registerSchema } from "../schemas/index.js";
import { ok } from "../middlewares/errorHandler.js";

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const body = registerSchema.parse(req.body);
      const data = await authService.register(body);
      return ok(res, data, 201);
    } catch (err) {
      return next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();
    res.once("finish", () => {
      console.info("[auth.login] resposta finalizada", {
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    try {
      console.info("[auth.login] inicio do login", {
        method: req.method,
        path: req.originalUrl,
        origin: req.get("origin") || null,
        cfRay: req.get("cf-ray") || null,
      });
      console.info("[auth.login] validacao do payload - inicio");
      const body = loginSchema.parse(req.body);
      console.info("[auth.login] validacao do payload - fim", {
        email: body.email.trim().toLowerCase(),
      });
      const data = await authService.login(body);
      console.info("[auth.login] resposta enviada", {
        userId: data.user.id,
      });
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.me(req.user!.id);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },
};
