import type { NextFunction, Request, Response } from "express";
import { ok } from "../middlewares/errorHandler.js";
import { shoppingAssistantSchema } from "../schemas/index.js";
import { shoppingAssistantService } from "../services/shoppingAssistantService.js";

export const shoppingAssistantController = {
  async ask(req: Request, res: Response, next: NextFunction) {
    try { const { message } = shoppingAssistantSchema.parse(req.body); return ok(res, await shoppingAssistantService.ask(req.user!.id, message)); }
    catch (error) { return next(error); }
  },
};
