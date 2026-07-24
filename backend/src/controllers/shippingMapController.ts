import type { NextFunction, Request, Response } from "express";
import { ok } from "../middlewares/errorHandler.js";
import { shippingMapService } from "../services/shippingMapService.js";
export const shippingMapController = {
  async list(req: Request, res: Response, next: NextFunction) { try { return ok(res, await shippingMapService.list(req.user!.id)); } catch (error) { return next(error); } },
  async refresh(req: Request, res: Response, next: NextFunction) { try { return ok(res, await shippingMapService.refresh(req.user!.id)); } catch (error) { return next(error); } },
  async updateLink(req: Request, res: Response, next: NextFunction) { try { return ok(res, await shippingMapService.updateLink(req.user!.id, String(req.params.id), String(req.body?.purchaseUrl || ""))); } catch (error) { return next(error); } },
};
