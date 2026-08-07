import type { NextFunction, Request, Response } from "express";
import { ok } from "../middlewares/errorHandler.js";
import { personalShopperActionSchema, personalShopperMessageSchema } from "../schemas/index.js";
import { personalShopperService } from "../services/personalShopperService.js";

export const personalShopperController = {
  async list(req: Request, res: Response, next: NextFunction) { try { return ok(res, await personalShopperService.listConversations(req.user!.id)); } catch (error) { return next(error); } },
  async get(req: Request, res: Response, next: NextFunction) { try { return ok(res, await personalShopperService.getConversation(req.user!.id, String(req.params.id))); } catch (error) { return next(error); } },
  async message(req: Request, res: Response, next: NextFunction) { try { const body = personalShopperMessageSchema.parse(req.body); return ok(res, await personalShopperService.message(req.user!.id, body.conversationId, body.message)); } catch (error) { return next(error); } },
  async action(req: Request, res: Response, next: NextFunction) { try { const body = personalShopperActionSchema.parse(req.body); return ok(res, await personalShopperService.action(req.user!.id, String(req.params.id), body.resultId, body.action, body)); } catch (error) { return next(error); } },
};
