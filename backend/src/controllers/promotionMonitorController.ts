import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { ok, AppError } from "../middlewares/errorHandler.js";
import { promotionSettingsSchema, promotionWatchItemSchema } from "../schemas/index.js";
import { shoppingProviders } from "../services/shoppingProviders/index.js";
import { promotionMonitorService } from "../services/promotionMonitorService.js";

const serializeOffer = (offer: { productPrice: unknown; shippingPrice: unknown; totalPrice: unknown; originalPrice: unknown; [key: string]: unknown }) => ({ ...offer, productPrice: Number(offer.productPrice), shippingPrice: offer.shippingPrice == null ? null : Number(offer.shippingPrice), totalPrice: offer.totalPrice == null ? null : Number(offer.totalPrice), originalPrice: offer.originalPrice == null ? null : Number(offer.originalPrice) });
const serializeItem = (item: { maximumTotalPrice: unknown; offers?: unknown[]; [key: string]: unknown }) => ({ ...item, maximumTotalPrice: Number(item.maximumTotalPrice), ...(item.offers ? { offers: item.offers.map((offer) => serializeOffer(offer as never)) } : {}) });
const paramId = (req: Request) => Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
async function watchedItemWithLatestOffer(userId: string, id: string) {
  const item = await prisma.promotionWatchItem.findFirst({ where: { id, userId }, include: { offers: { orderBy: { checkedAt: "desc" }, take: 1 } } });
  if (!item) throw new AppError("Monitoramento não encontrado", 404);
  return serializeItem(item);
}

export const promotionMonitorController = {
  async settings(req: Request, res: Response, next: NextFunction) {
    try { const value = await prisma.promotionSettings.findUnique({ where: { userId: req.user!.id } }); return ok(res, { shippingPostalCode: value?.shippingPostalCode || null }); } catch (error) { return next(error); }
  },
  async saveSettings(req: Request, res: Response, next: NextFunction) {
    try { const input = promotionSettingsSchema.parse(req.body); const shippingPostalCode = input.shippingPostalCode?.replace(/\D/g, "") || null; const value = await prisma.promotionSettings.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, shippingPostalCode }, update: { shippingPostalCode } }); return ok(res, { shippingPostalCode: value.shippingPostalCode }); } catch (error) { return next(error); }
  },
  async list(req: Request, res: Response, next: NextFunction) {
    try { const values = await prisma.promotionWatchItem.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: "desc" }, include: { offers: { orderBy: { checkedAt: "desc" }, take: 1 } } }); return ok(res, values.map(serializeItem)); } catch (error) { return next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try { const input = promotionWatchItemSchema.parse(req.body); const value = await prisma.promotionWatchItem.create({ data: { userId: req.user!.id, ...input } }); await promotionMonitorService.checkNow(req.user!.id, value.id); return ok(res, await watchedItemWithLatestOffer(req.user!.id, value.id), 201); } catch (error) { return next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try { const input = promotionWatchItemSchema.partial().parse(req.body); const current = await prisma.promotionWatchItem.findFirst({ where: { id: paramId(req), userId: req.user!.id } }); if (!current) throw new AppError("Monitoramento não encontrado", 404); const value = await prisma.promotionWatchItem.update({ where: { id: current.id }, data: input }); return ok(res, serializeItem(value)); } catch (error) { return next(error); }
  },
  async remove(req: Request, res: Response, next: NextFunction) {
    try { const current = await prisma.promotionWatchItem.findFirst({ where: { id: paramId(req), userId: req.user!.id } }); if (!current) throw new AppError("Monitoramento não encontrado", 404); await prisma.promotionWatchItem.delete({ where: { id: current.id } }); return res.status(204).send(); } catch (error) { return next(error); }
  },
  async offers(req: Request, res: Response, next: NextFunction) {
    try { const item = await prisma.promotionWatchItem.findFirst({ where: { id: paramId(req), userId: req.user!.id }, include: { offers: { orderBy: [{ totalPrice: "asc" }, { checkedAt: "desc" }], take: 100 } } }); if (!item) throw new AppError("Monitoramento não encontrado", 404); return ok(res, serializeItem(item)); } catch (error) { return next(error); }
  },
  async checkNow(req: Request, res: Response, next: NextFunction) {
    try { const id = paramId(req); await promotionMonitorService.checkNow(req.user!.id, id); return ok(res, await watchedItemWithLatestOffer(req.user!.id, id)); } catch (error) { return next(error); }
  },
  async providers(_req: Request, res: Response, next: NextFunction) {
    try { return ok(res, shoppingProviders.map(({ id, status }) => ({ id, status }))); } catch (error) { return next(error); }
  },
};
