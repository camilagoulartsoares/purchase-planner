import type { NextFunction, Request, Response } from "express";
import { ok } from "../middlewares/errorHandler.js";
import { findingService, type FindingPayload } from "../services/findingService.js";
import { linkImportService } from "../services/linkImportService.js";

export const findingController = {
  async preview(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await linkImportService.preview(String(req.body?.url || ""))); } catch (error) { return next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await findingService.create(req.user!.id, req.body as FindingPayload), 201); } catch (error) { return next(error); }
  },
  async list(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await findingService.list(req.user!.id)); } catch (error) { return next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await findingService.update(req.user!.id, String(req.params.id), req.body as FindingPayload)); } catch (error) { return next(error); }
  },
  async remove(req: Request, res: Response, next: NextFunction) {
    try { await findingService.remove(req.user!.id, String(req.params.id)); return ok(res, { deleted: true }); } catch (error) { return next(error); }
  },
};
