import { AppError } from "../middlewares/errorHandler.js";
import { brandRepository } from "../repositories/brandRepository.js";
import { imageService } from "./imageService.js";
import {
  BRAND_FILTER_CATEGORIES,
  effectivePrice,
  slugify,
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
    ...new Set(
      brand.products.map((p) =>
        p.category === "TOP/CORSET" ? "Tops e corsets" : p.category,
      ),
    ),
  ].filter(
    (c) =>
      (BRAND_FILTER_CATEGORIES as readonly string[]).includes(c) ||
      c === "Tops e corsets",
  );

  const preferred = [
    "Calças",
    "Vestidos",
    "Blusas",
    "Tops e corsets",
    "Bodies",
    "Saias",
    "Shorts",
    "Conjuntos",
    "Casacos",
    "Calçados",
    "Bolsas",
    "Acessórios",
  ];
  const categories = preferred.filter((c) => categoriesPresent.includes(c));
  for (const c of categoriesPresent) {
    if (!categories.includes(c)) categories.push(c);
  }

  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    logoUrl: brand.logoUrl,
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
      isFavorite: Boolean((p as { isFavorite?: boolean }).isFavorite),
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
      .map((b) => serializeBrand(b)!)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },

  async getBySlug(userId: string, slug: string, category?: string) {
    const brand = await brandRepository.findBySlug(userId, slug);
    if (!brand) throw new AppError("Marca não encontrada", 404);
    return serializeBrand(brand, category || undefined);
  },

  async create(
    userId: string,
    name: string,
    logoFile?: Express.Multer.File,
  ) {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw new AppError("Informe o nome da marca", 400);
    }
    const slug = slugify(trimmed);
    const existing = await brandRepository.findBySlug(userId, slug);
    if (existing) {
      throw new AppError("Essa marca já está cadastrada", 409);
    }

    let logoUrl: string | null = null;
    let logoPublicId: string | null = null;
    if (logoFile) {
      const uploaded = await imageService.upload(logoFile);
      logoUrl = uploaded.imageUrl;
      logoPublicId = uploaded.imagePublicId;
    }

    const brand = await brandRepository.create({
      userId,
      name: trimmed,
      slug,
      logoUrl,
      logoPublicId,
    });

    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      productCount: 0,
      categories: [] as string[],
      allCategories: [] as string[],
      minPrice: 0,
      maxPrice: 0,
      totalValue: 0,
      products: [],
    };
  },
};
