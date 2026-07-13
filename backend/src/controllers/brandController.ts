import type { NextFunction, Request, Response } from "express";
import { ok } from "../middlewares/errorHandler.js";
import { brandService } from "../services/brandService.js";

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}

export const brandController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await brandService.list(req.user!.id);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const name = String(req.body.name || "");
      const data = await brandService.create(req.user!.id, name, req.file);
      return ok(res, data, 201);
    } catch (err) {
      return next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const category =
        typeof req.query.category === "string" ? req.query.category : undefined;
      const data = await brandService.getBySlug(
        req.user!.id,
        param(req.params.slug),
        category,
      );
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  },
};
