import { AppError } from "../middlewares/errorHandler.js";
import {
  productRepository,
  type ProductFilters,
  type ProductWithRelations,
} from "../repositories/productRepository.js";
import { brandRepository } from "../repositories/brandRepository.js";
import { imageService } from "./imageService.js";
import { effectivePrice } from "../utils/constants.js";

function serialize(product: ProductWithRelations | null) {
  if (!product) return null;
  const original = Number(product.originalPrice);
  const promo =
    product.promotionalPrice != null ? Number(product.promotionalPrice) : null;
  const price = effectivePrice(original, promo);
  const discount =
    promo != null && promo < original
      ? Math.round(((original - promo) / original) * 100)
      : 0;

  const images = (product.images || []).map((img) => ({
    id: img.id,
    imageUrl: img.imageUrl,
    imagePublicId: img.imagePublicId,
    position: img.position,
    isMain: img.isMain,
  }));

  const main =
    images.find((i) => i.isMain) || images[0] || null;

  return {
    id: product.id,
    name: product.name,
    category: product.category,
    brand: product.brand.name,
    brandId: product.brandId,
    brandSlug: product.brand.slug,
    store: product.store,
    originalPrice: original,
    promotionalPrice: promo,
    purchaseUrl: product.purchaseUrl,
    imageUrl: main?.imageUrl || product.imageUrl,
    color: product.color,
    size: product.size,
    priority: product.priority,
    status: product.status,
    notes: product.notes,
    purchasedPrice:
      product.purchasedPrice != null ? Number(product.purchasedPrice) : null,
    purchasedAt: product.purchasedAt,
    images,
    effectivePrice: price,
    discountPercent: discount,
    hasPromo: discount > 0,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function collectFiles(
  file?: Express.Multer.File,
  files?: Express.Multer.File[],
) {
  const list: Express.Multer.File[] = [];
  if (files?.length) list.push(...files);
  else if (file) list.push(file);
  return list;
}

export const productService = {
  async list(userId: string, filters: ProductFilters) {
    const result = await productRepository.findMany(userId, filters);
    return {
      items: result.items.map((p) => serialize(p)!),
      meta: result.meta,
    };
  },

  async getById(userId: string, id: string) {
    const product = await productRepository.findById(id);
    if (!product || product.userId !== userId) {
      throw new AppError("Produto não encontrado", 404);
    }
    return serialize(product);
  },

  async create(
    userId: string,
    data: Record<string, unknown>,
    file?: Express.Multer.File,
    files?: Express.Multer.File[],
  ) {
    const brand = await brandRepository.findOrCreate(
      userId,
      String(data.brand),
    );

    const uploads = await imageService.uploadMany(collectFiles(file, files));
    const main = uploads[0];

    const product = await productRepository.create({
      user: { connect: { id: userId } },
      brand: { connect: { id: brand.id } },
      name: String(data.name),
      category: String(data.category),
      store: String(data.store),
      originalPrice: Number(data.originalPrice),
      promotionalPrice:
        data.promotionalPrice != null && data.promotionalPrice !== ""
          ? Number(data.promotionalPrice)
          : null,
      purchaseUrl: data.purchaseUrl ? String(data.purchaseUrl) : null,
      color: data.color ? String(data.color) : null,
      size: data.size ? String(data.size) : null,
      priority: String(data.priority || "Quero"),
      status: String(data.status || "Quero comprar"),
      notes: data.notes ? String(data.notes) : null,
      imageUrl: main?.imageUrl,
      imagePublicId: main?.imagePublicId,
      images: uploads.length
        ? {
            create: uploads.map((img, index) => ({
              imageUrl: img.imageUrl,
              imagePublicId: img.imagePublicId,
              position: index,
              isMain: index === 0,
            })),
          }
        : undefined,
    });

    return serialize(product);
  },

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
    file?: Express.Multer.File,
    files?: Express.Multer.File[],
  ) {
    const existing = await productRepository.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new AppError("Produto não encontrado", 404);
    }

    const brand = await brandRepository.findOrCreate(
      userId,
      String(data.brand),
    );

    const newFiles = collectFiles(file, files);
    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId;

    if (newFiles.length) {
      for (const img of existing.images) {
        await imageService.remove(img.imagePublicId);
      }
      const uploads = await imageService.uploadMany(newFiles);
      await productRepository.replaceImages(
        id,
        uploads.map((img, index) => ({
          imageUrl: img.imageUrl,
          imagePublicId: img.imagePublicId,
          position: index,
          isMain: index === 0,
        })),
      );
      imageUrl = uploads[0].imageUrl;
      imagePublicId = uploads[0].imagePublicId;
    }

    const product = await productRepository.update(id, {
      brand: { connect: { id: brand.id } },
      name: String(data.name),
      category: String(data.category),
      store: String(data.store),
      originalPrice: Number(data.originalPrice),
      promotionalPrice:
        data.promotionalPrice != null && data.promotionalPrice !== ""
          ? Number(data.promotionalPrice)
          : null,
      purchaseUrl: data.purchaseUrl ? String(data.purchaseUrl) : null,
      color: data.color ? String(data.color) : null,
      size: data.size ? String(data.size) : null,
      priority: String(data.priority || "Quero"),
      status: String(data.status || "Quero comprar"),
      notes: data.notes ? String(data.notes) : null,
      imageUrl,
      imagePublicId,
    });

    return serialize(product);
  },

  async updateStatus(
    userId: string,
    id: string,
    payload: {
      status: string;
      purchasedPrice?: number;
      purchasedAt?: string;
      notes?: string | null;
    },
  ) {
    const existing = await productRepository.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new AppError("Produto não encontrado", 404);
    }

    if (payload.status === "Já comprei") {
      if (!payload.purchasedPrice || payload.purchasedPrice <= 0) {
        throw new AppError("Informe o preço realmente pago", 400);
      }
    }

    const product = await productRepository.update(id, {
      status: payload.status,
      purchasedPrice:
        payload.status === "Já comprei" ? payload.purchasedPrice : null,
      purchasedAt:
        payload.status === "Já comprei"
          ? payload.purchasedAt
            ? new Date(payload.purchasedAt)
            : new Date()
          : null,
      notes: payload.notes ?? existing.notes,
    });

    return serialize(product);
  },

  async remove(userId: string, id: string) {
    const existing = await productRepository.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new AppError("Produto não encontrado", 404);
    }
    for (const img of existing.images) {
      await imageService.remove(img.imagePublicId);
    }
    await imageService.remove(existing.imagePublicId);
    await productRepository.delete(id);
  },

  async summary(userId: string) {
    const products = await productRepository.findAllByUser(userId);
    const desired = products.filter(
      (p) =>
        p.status === "Quero comprar" || p.status === "Esperando promoção",
    );
    const bought = products.filter((p) => p.status === "Já comprei");
    const waiting = products.filter((p) => p.status === "Esperando promoção");

    const wishTotal = desired.reduce((sum, p) => {
      const o = Number(p.originalPrice);
      const pr = p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
      return sum + effectivePrice(o, pr);
    }, 0);

    const spentTotal = bought.reduce((sum, p) => {
      if (p.purchasedPrice != null) return sum + Number(p.purchasedPrice);
      const o = Number(p.originalPrice);
      const pr = p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
      return sum + effectivePrice(o, pr);
    }, 0);

    const savedTotal = products.reduce((sum, p) => {
      const o = Number(p.originalPrice);
      const pr = p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
      if (pr != null && pr < o) return sum + (o - pr);
      return sum;
    }, 0);

    return {
      wantCount: desired.length,
      boughtCount: bought.length,
      waitingCount: waiting.length,
      wishTotal,
      spentTotal,
      savedTotal,
      counts: {
        "Quero comprar": products.filter((p) => p.status === "Quero comprar")
          .length,
        "Esperando promoção": waiting.length,
        "Já comprei": bought.length,
        "Desisti da compra": products.filter(
          (p) => p.status === "Desisti da compra",
        ).length,
      },
    };
  },
};
