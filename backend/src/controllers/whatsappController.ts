import type { NextFunction, Request, Response } from "express";
import { ok } from "../middlewares/errorHandler.js";
import { evolutionApiService } from "../services/evolutionApiService.js";

export const whatsappController = {
  async status(_req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await evolutionApiService.status()); } catch (error) { return next(error); }
  },
  async createInstance(_req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await evolutionApiService.createInstance(), 201); } catch (error) { return next(error); }
  },
  async qrCode(_req: Request, res: Response, next: NextFunction) {
    try { return ok(res, await evolutionApiService.qrCode()); } catch (error) { return next(error); }
  },
  async test(req: Request, res: Response, next: NextFunction) {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message.slice(0, 1000) : undefined;
      return ok(res, await evolutionApiService.sendTest(message));
    } catch (error) { return next(error); }
  },
};
