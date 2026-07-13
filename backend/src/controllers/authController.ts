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
    try {
      const body = loginSchema.parse(req.body);
      const data = await authService.login(body);
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
