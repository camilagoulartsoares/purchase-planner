import { AppError } from "../middlewares/errorHandler.js";
import {
  productRepository,
  type ProductFilters,
  type ProductWithRelations,
} from "../repositories/productRepository.js";
import { brandRepository } from "../repositories/brandRepository.js";
import { imageService } from "./imageService.js";
import { backupService } from "./backupService.js";
import { effectivePrice } from "../utils/constants.js";

function safeBackup(reason: string) {
  try {
    backupService.create(reason);
  } catch (err) {
    console.warn("Falha ao criar backup automático", err);
  }
}

function buildBrandShippingMap(products: ProductWithRelations[]) {
  const grouped = new Map<
    string,
    { shippingPrice: number; createdAt: Date }[]
  >();

  for (const product of products) {
    if (product.shippingPrice == null) continue;
    const shipping = Number(product.shippingPrice);
    if (!Number.isFinite(shipping) || shipping <= 0) continue;

    const current = grouped.get(product.brandId) || [];
    current.push({ shippingPrice: shipping, createdAt: product.createdAt });
    grouped.set(product.brandId, current);
  }

  const brandShipping = new Map<string, number>();
  for (const [brandId, entries] of grouped.entries()) {
    entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    brandShipping.set(brandId, entries[0].shippingPrice);
  }

  return brandShipping;
}

function serialize(
  product: ProductWithRelations | null,
  brandShipping = new Map<string, number>(),
) {
  if (!product) return null;
  const original = Number(product.originalPrice);
  const promo =
    product.promotionalPrice != null ? Number(product.promotionalPrice) : null;
  const ownShipping =
    product.shippingPrice != null ? Number(product.shippingPrice) : null;
  const effectiveShipping =
    ownShipping ?? brandShipping.get(product.brandId) ?? null;
  const price = effectivePrice(original, promo, effectiveShipping);
  const discount =
    promo != null && promo < original
      ? Math.round(((original - promo) / original) * 100)
      : 0;

  const images = (product.images || [])
    .map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      imagePublicId: img.imagePublicId,
      position: img.position,
      isMain: img.isMain,
    }))
    .sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
      return a.position - b.position;
    });

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
    shippingPrice: ownShipping,
    effectiveShippingPrice: effectiveShipping,
    shippingInherited:
      ownShipping == null && effectiveShipping != null && effectiveShipping > 0,
    purchaseUrl: product.purchaseUrl,
    imageUrl: main?.imageUrl || product.imageUrl,
    color: product.color,
    size: product.size,
    priority: product.priority,
    status: product.status,
    notes: product.notes,
    isFavorite: Boolean(product.isFavorite),
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
    const brandShipping = buildBrandShippingMap(
      await productRepository.findAllByUser(userId),
    );
    return {
      items: result.items.map((p) => serialize(p, brandShipping)!),
      meta: result.meta,
    };
  },

  async getById(userId: string, id: string) {
    const product = await productRepository.findById(id);
    if (!product || product.userId !== userId) {
      throw new AppError("Produto não encontrado", 404);
    }
    const brandShipping = buildBrandShippingMap(
      await productRepository.findAllByUser(userId),
    );
    return serialize(product, brandShipping);
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
      shippingPrice:
        data.shippingPrice != null && data.shippingPrice !== ""
          ? Number(data.shippingPrice)
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

    safeBackup("product-create");
    const brandShipping = buildBrandShippingMap(
      await productRepository.findAllByUser(userId),
    );
    return serialize(product, brandShipping);
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
    const keepRaw = data.keepImageIds;
    const hasKeepField =
      keepRaw !== undefined && keepRaw !== null && String(keepRaw) !== "";

    let keepIds: string[] | null = null;
    if (hasKeepField) {
      try {
        const parsed =
          typeof keepRaw === "string" ? JSON.parse(keepRaw) : keepRaw;
        keepIds = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        keepIds = String(keepRaw)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    // Modo galeria: keepImageIds informado → remove o que saiu e anexa novas
    if (keepIds) {
      const toRemove = existing.images.filter((img) => !keepIds!.includes(img.id));
      for (const img of toRemove) {
        await imageService.remove(img.imagePublicId);
      }
      await productRepository.deleteImagesByIds(
        id,
        toRemove.map((img) => img.id),
      );

      const remaining = existing.images.filter((img) => keepIds!.includes(img.id));
      const uploads = await imageService.uploadMany(newFiles);
      const startPos = remaining.length;
      let createdNewIds: string[] = [];
      if (uploads.length) {
        await productRepository.addImages(
          id,
          uploads.map((img, index) => ({
            imageUrl: img.imageUrl,
            imagePublicId: img.imagePublicId,
            position: startPos + index,
            isMain: false,
          })),
        );
        const after = await productRepository.listImages(id);
        createdNewIds = after
          .filter((img) => !keepIds!.includes(img.id))
          .sort((a, b) => a.position - b.position)
          .map((img) => img.id);
      }

      const all = await productRepository.listImages(id);
      let mainId: string | undefined;
      if (data.mainImageId != null && String(data.mainImageId)) {
        mainId = String(data.mainImageId);
      } else if (
        data.mainNewIndex != null &&
        String(data.mainNewIndex) !== "" &&
        createdNewIds.length
      ) {
        const idx = Number(data.mainNewIndex);
        if (Number.isFinite(idx) && createdNewIds[idx]) mainId = createdNewIds[idx];
      } else {
        mainId = all.find((i) => i.isMain)?.id || all[0]?.id;
      }

      if (mainId && all.some((i) => i.id === mainId)) {
        await productRepository.setMainImage(id, mainId);
      } else if (all[0]) {
        await productRepository.setMainImage(id, all[0].id);
      }

      const finalImages = await productRepository.reindexImages(id);
      const main = finalImages.find((i) => i.isMain) || finalImages[0] || null;

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
        shippingPrice:
          data.shippingPrice != null && data.shippingPrice !== ""
            ? Number(data.shippingPrice)
            : null,
        purchaseUrl: data.purchaseUrl ? String(data.purchaseUrl) : null,
        color: data.color ? String(data.color) : null,
        size: data.size ? String(data.size) : null,
        priority: String(data.priority || "Quero"),
        status: String(data.status || "Quero comprar"),
        notes: data.notes ? String(data.notes) : null,
        imageUrl: main?.imageUrl ?? null,
        imagePublicId: main?.imagePublicId ?? null,
      });

      safeBackup("product-update");
      const brandShipping = buildBrandShippingMap(
        await productRepository.findAllByUser(userId),
      );
      return serialize(product, brandShipping);
    }

    // Compat: sem keepImageIds, comportamento antigo (substituir tudo se houver arquivos)
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
      shippingPrice:
        data.shippingPrice != null && data.shippingPrice !== ""
          ? Number(data.shippingPrice)
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

    safeBackup("product-update");
    const brandShipping = buildBrandShippingMap(
      await productRepository.findAllByUser(userId),
    );
    return serialize(product, brandShipping);
  },

  async updateStatus(
    userId: string,
    id: string,
    payload: {
      status: string;
      purchasedPrice?: number;
      purchasedAt?: string;
      notes?: string | null;
      repurchase?: boolean;
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

    if (payload.status === "Já comprei" && payload.repurchase) {
      const purchasedAt = payload.purchasedAt
        ? new Date(payload.purchasedAt)
        : new Date();

      const product = await productRepository.create({
        user: { connect: { id: userId } },
        brand: { connect: { id: existing.brandId } },
        name: existing.name,
        category: existing.category,
        store: existing.store,
        originalPrice: existing.originalPrice,
        promotionalPrice: existing.promotionalPrice,
        shippingPrice: existing.shippingPrice,
        purchaseUrl: existing.purchaseUrl,
        imageUrl: existing.imageUrl,
        imagePublicId: existing.imagePublicId,
        color: existing.color,
        size: existing.size,
        priority: existing.priority,
        status: "Já comprei",
        notes: payload.notes ?? existing.notes,
        isFavorite: existing.isFavorite,
        purchasedPrice: payload.purchasedPrice,
        purchasedAt,
        images: existing.images.length
          ? {
              create: existing.images.map((image) => ({
                imageUrl: image.imageUrl,
                imagePublicId: image.imagePublicId,
                position: image.position,
                isMain: image.isMain,
              })),
            }
          : undefined,
      });

      safeBackup("product-repurchase");
      const brandShipping = buildBrandShippingMap(
        await productRepository.findAllByUser(userId),
      );
      return serialize(product, brandShipping);
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

    safeBackup("product-status");
    const brandShipping = buildBrandShippingMap(
      await productRepository.findAllByUser(userId),
    );
    return serialize(product, brandShipping);
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
    safeBackup("product-delete");
  },

  async toggleFavorite(userId: string, id: string) {
    const existing = await productRepository.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new AppError("Produto não encontrado", 404);
    }
    const product = await productRepository.update(id, {
      isFavorite: !existing.isFavorite,
    });
    const brandShipping = buildBrandShippingMap(
      await productRepository.findAllByUser(userId),
    );
    return serialize(product, brandShipping);
  },

  async summary(userId: string) {
    const products = await productRepository.findAllByUser(userId);
    const brandShipping = buildBrandShippingMap(products);
    const desired = products.filter(
      (p) =>
        p.status === "Quero comprar" || p.status === "Esperando promoção",
    );
    const bought = products.filter((p) => p.status === "Já comprei");
    const waiting = products.filter((p) => p.status === "Esperando promoção");

    const wishTotal = desired.reduce((sum, p) => {
      const o = Number(p.originalPrice);
      const pr = p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
      const shipping =
        p.shippingPrice != null
          ? Number(p.shippingPrice)
          : (brandShipping.get(p.brandId) ?? null);
      return sum + effectivePrice(o, pr, shipping);
    }, 0);

    const spentTotal = bought.reduce((sum, p) => {
      if (p.purchasedPrice != null) return sum + Number(p.purchasedPrice);
      const o = Number(p.originalPrice);
      const pr = p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
      const shipping =
        p.shippingPrice != null
          ? Number(p.shippingPrice)
          : (brandShipping.get(p.brandId) ?? null);
      return sum + effectivePrice(o, pr, shipping);
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
