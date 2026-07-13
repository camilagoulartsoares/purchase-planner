import { AppError } from "../middlewares/errorHandler.js";
import { brandRepository } from "../repositories/brandRepository.js";
import {
  BRAND_FILTER_CATEGORIES,
  effectivePrice,
} from "../utils/constants.js";

function priceOf(p: {
  originalPrice: unknown;
  promotionalPrice: unknown;
}) {
  const o = Number(p.originalPrice);
  const pr = p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
  return effectivePrice(o, pr);
}

function serializeBrand(
  brand: Awaited<ReturnType<typeof brandRepository.findBySlug>>,
  categoryFilter?: string,
) {
  if (!brand) return null;

  let products = brand.products;
  if (categoryFilter) {
    products = products.filter((p) => p.category === categoryFilter);
  }

  const prices = products.map(priceOf);
  const categoriesPresent = [
    ...new Set(brand.products.map((p) => p.category)),
  ].filter((c) =>
    (BRAND_FILTER_CATEGORIES as readonly string[]).includes(c),
  );

  // Keep order of BRAND_FILTER_CATEGORIES
  const categories = BRAND_FILTER_CATEGORIES.filter((c) =>
    categoriesPresent.includes(c),
  );

  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    productCount: products.length,
    categories,
    allCategories: [...new Set(brand.products.map((p) => p.category))],
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    totalValue: prices.reduce((s, n) => s + n, 0),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      brand: brand.name,
      brandId: brand.id,
      brandSlug: brand.slug,
      store: p.store,
      originalPrice: Number(p.originalPrice),
      promotionalPrice:
        p.promotionalPrice != null ? Number(p.promotionalPrice) : null,
      purchaseUrl: p.purchaseUrl,
      imageUrl:
        p.images.find((i) => i.isMain)?.imageUrl ||
        p.images[0]?.imageUrl ||
        p.imageUrl,
      images: p.images.map((img) => ({
        id: img.id,
        imageUrl: img.imageUrl,
        imagePublicId: img.imagePublicId,
        position: img.position,
        isMain: img.isMain,
      })),
      color: p.color,
      size: p.size,
      priority: p.priority,
      status: p.status,
      notes: p.notes,
      effectivePrice: priceOf(p),
      discountPercent: (() => {
        const o = Number(p.originalPrice);
        const pr =
          p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
        return pr != null && pr < o
          ? Math.round(((o - pr) / o) * 100)
          : 0;
      })(),
      hasPromo: (() => {
        const o = Number(p.originalPrice);
        const pr =
          p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
        return pr != null && pr < o;
      })(),
    })),
  };
}

export const brandService = {
  async list(userId: string) {
    const brands = await brandRepository.findByUser(userId);
    return brands
      .filter((b) => b.products.length > 0)
      .map((b) => serializeBrand(b)!)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },

  async getBySlug(userId: string, slug: string, category?: string) {
    const brand = await brandRepository.findBySlug(userId, slug);
    if (!brand) throw new AppError("Marca não encontrada", 404);
    return serializeBrand(brand, category || undefined);
  },
};
