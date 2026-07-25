import type { NextFunction, Request, Response } from "express";
import { ok } from "../middlewares/errorHandler.js";
import { purchaseAnalysisSchema } from "../schemas/index.js";
import { purchaseAnalysisService } from "../services/purchaseAnalysisService.js";
export const purchaseAnalysisController = { async analyze(req: Request, res: Response, next: NextFunction) { try { const { budget } = purchaseAnalysisSchema.parse(req.body); const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id; return ok(res, await purchaseAnalysisService.analyze(req.user!.id, id, budget ?? null)); } catch (error) { return next(error); } } };
