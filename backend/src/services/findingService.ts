import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { normalizeFindingUrl, type FindingMediaInput } from "./linkImportService.js";

export type FindingPayload = {
  title?: string;
  brand?: string | null;
  store?: string | null;
  description?: string | null;
  price?: number | null;
  previousPrice?: number | null;
  currency?: string | null;
  originalUrl?: string;
  category?: string | null;
  availability?: string | null;
  media?: FindingMediaInput[];
};

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new AppError("Preco invalido.", 400);
  return number;
}

function mediaFrom(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item): FindingMediaInput[] => {
    if (!item || typeof item !== "object") return [];
    const { type, url } = item as Record<string, unknown>;
    if ((type !== "image" && type !== "video") || typeof url !== "string") return [];
    try {
      const normalized = new URL(url);
      if (!/^https?:$/.test(normalized.protocol) || seen.has(`${type}:${normalized}`)) return [];
      seen.add(`${type}:${normalized}`);
      return [{ type, url: normalized.toString() }];
    } catch { return []; }
  }).slice(0, 52);
}

function serialize(finding: Prisma.FindingGetPayload<{ include: { media: true } }>) {
  return {
    ...finding,
    price: finding.price === null ? null : Number(finding.price),
    previousPrice: finding.previousPrice === null ? null : Number(finding.previousPrice),
    media: finding.media.sort((a, b) => a.position - b.position).map(({ type, url }) => ({ type: type as "image" | "video", url })),
  };
}

function dataFrom(payload: FindingPayload, requireUrl: boolean) {
  if (requireUrl && !payload.originalUrl) throw new AppError("originalUrl e obrigatoria.", 400);
  const originalUrl = payload.originalUrl ? normalizeFindingUrl(payload.originalUrl) : undefined;
  return {
    ...(originalUrl ? { originalUrl, normalizedUrl: originalUrl } : {}),
    ...(payload.title !== undefined ? { title: String(payload.title).trim() } : {}),
    ...(payload.brand !== undefined ? { brand: nullableString(payload.brand) } : {}),
    ...(payload.store !== undefined ? { store: nullableString(payload.store) } : {}),
    ...(payload.description !== undefined ? { description: nullableString(payload.description) } : {}),
    ...(payload.price !== undefined ? { price: nullableNumber(payload.price) } : {}),
    ...(payload.previousPrice !== undefined ? { previousPrice: nullableNumber(payload.previousPrice) } : {}),
    ...(payload.currency !== undefined ? { currency: nullableString(payload.currency)?.toUpperCase() || "BRL" } : {}),
    ...(payload.category !== undefined ? { category: nullableString(payload.category) } : {}),
    ...(payload.availability !== undefined ? { availability: nullableString(payload.availability) } : {}),
  };
}

export const findingService = {
  async create(userId: string, payload: FindingPayload) {
    const data = dataFrom(payload, true);
    const media = mediaFrom(payload.media);
    const existing = await prisma.finding.findUnique({ where: { userId_normalizedUrl: { userId, normalizedUrl: data.normalizedUrl! } } });
    if (existing) throw new AppError("Este produto ja esta salvo nos seus achados.", 409);
    const finding = await prisma.finding.create({
      data: { userId, title: data.title || "", brand: data.brand, store: data.store, description: data.description, price: data.price, previousPrice: data.previousPrice, currency: data.currency || "BRL", originalUrl: data.originalUrl!, normalizedUrl: data.normalizedUrl!, category: data.category, availability: data.availability, media: { create: media.map((item, position) => ({ ...item, position })) } },
      include: { media: true },
    });
    return serialize(finding);
  },
  async list(userId: string) {
    const findings = await prisma.finding.findMany({ where: { userId }, include: { media: true }, orderBy: { createdAt: "desc" } });
    return findings.map(serialize);
  },
  async update(userId: string, id: string, payload: FindingPayload) {
    const found = await prisma.finding.findFirst({ where: { id, userId } });
    if (!found) throw new AppError("Achado nao encontrado.", 404);
    const data = dataFrom(payload, false);
    if (data.normalizedUrl && data.normalizedUrl !== found.normalizedUrl) {
      const duplicate = await prisma.finding.findUnique({ where: { userId_normalizedUrl: { userId, normalizedUrl: data.normalizedUrl } } });
      if (duplicate) throw new AppError("Este produto ja esta salvo nos seus achados.", 409);
    }
    const media = payload.media === undefined ? undefined : mediaFrom(payload.media);
    const finding = await prisma.finding.update({
      where: { id },
      data: { ...data, ...(media ? { media: { deleteMany: {}, create: media.map((item, position) => ({ ...item, position })) } } : {}) },
      include: { media: true },
    });
    return serialize(finding);
  },
  async remove(userId: string, id: string) {
    const deleted = await prisma.finding.findMany({ where: { id, userId }, select: { id: true } });
    if (!deleted.length) throw new AppError("Achado nao encontrado.", 404);
    await prisma.finding.delete({ where: { id } });
  },
};
