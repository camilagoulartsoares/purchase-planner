import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { departmentCategories } from "../utils/constants.js";
import { effectivePrice } from "../utils/constants.js";

export type ProductFilters = {
  search?: string;
  department?: "moda" | "achadinhos" | "";
  category?: string;
  brand?: string;
  brandSlug?: string;
  store?: string;
  color?: string;
  size?: string;
  priority?: string;
  status?: string;
  favorite?: boolean;
  promo?: "com" | "sem" | "";
  minPrice?: number;
  maxPrice?: number;
  priceBand?: string;
  sort?: string;
  page: number;
  perPage: number;
};

const productInclude = {
  brand: true,
  images: { orderBy: { position: "asc" as const } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

function bandRange(band?: string): { min?: number; max?: number } {
  switch (band) {
    case "ate-50":
      return { max: 50 };
    case "50-100":
      return { min: 50, max: 100 };
    case "100-200":
      return { min: 100, max: 200 };
    case "200-300":
      return { min: 200, max: 300 };
    case "300-500":
      return { min: 300, max: 500 };
    case "500-1000":
      return { min: 500, max: 1000 };
    case "acima-1000":
      return { min: 1000.01 };
    default:
      return {};
  }
}

function buildBrandShippingMap(
  products: {
    brandId: string;
    shippingPrice: Prisma.Decimal | number | null;
    createdAt: Date;
  }[],
) {
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

export const productRepository = {
  async findMany(userId: string, filters: ProductFilters) {
    const where: Prisma.ProductWhereInput = { userId };

    if (filters.category) where.category = filters.category;
    else if (filters.department) {
      where.category = { in: departmentCategories(filters.department) };
    }
    if (filters.brand) {
      where.brand = { name: filters.brand };
    }
    if (filters.brandSlug) {
      where.brand = { ...(where.brand as object), slug: filters.brandSlug };
    }
    if (filters.store) where.store = filters.store;
    if (filters.color) where.color = filters.color;
    if (filters.size) where.size = filters.size;
    if (filters.priority) where.priority = filters.priority;
    if (filters.status) where.status = filters.status;
    if (filters.favorite) where.isFavorite = true;

    if (filters.search) {
      const contains = { contains: filters.search, mode: "insensitive" as const };
      where.OR = [
        { name: contains },
        { category: contains },
        { store: contains },
        { brand: { name: contains } },
      ];
    }

    const band = bandRange(filters.priceBand);

    const [all, allUserProducts] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.findMany({
        where: { userId },
        select: { brandId: true, shippingPrice: true, createdAt: true },
      }),
    ]);

    const brandShipping = buildBrandShippingMap(allUserProducts);

    let list = all.filter((p) => {
      const original = Number(p.originalPrice);
      const promo =
        p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
      const shipping =
        p.shippingPrice != null
          ? Number(p.shippingPrice)
          : (brandShipping.get(p.brandId) ?? null);
      const price = effectivePrice(original, promo, shipping);
      const hasPromo = promo != null && promo > 0 && promo < original;

      if (filters.promo === "com" && !hasPromo) return false;
      if (filters.promo === "sem" && hasPromo) return false;

      const min = filters.minPrice ?? band.min;
      const max = filters.maxPrice ?? band.max;
      if (min != null && price < min) return false;
      if (max != null && price > max) return false;
      return true;
    });

    const priorityRank: Record<string, number> = {
      "Quero muito": 3,
      Quero: 2,
      Talvez: 1,
    };

    list = list.sort((a, b) => {
      const ao = Number(a.originalPrice);
      const ap = a.promotionalPrice != null ? Number(a.promotionalPrice) : null;
      const bo = Number(b.originalPrice);
      const bp = b.promotionalPrice != null ? Number(b.promotionalPrice) : null;
      const as =
        a.shippingPrice != null
          ? Number(a.shippingPrice)
          : (brandShipping.get(a.brandId) ?? null);
      const bs =
        b.shippingPrice != null
          ? Number(b.shippingPrice)
          : (brandShipping.get(b.brandId) ?? null);
      const ae = effectivePrice(ao, ap, as);
      const be = effectivePrice(bo, bp, bs);
      const ad =
        ap != null && ap < ao ? Math.round(((ao - ap) / ao) * 100) : 0;
      const bd =
        bp != null && bp < bo ? Math.round(((bo - bp) / bo) * 100) : 0;

      switch (filters.sort) {
        case "menor-preco": {
          const byPrice = ae - be;
          return byPrice !== 0
            ? byPrice
            : a.name.localeCompare(b.name, "pt-BR");
        }
        case "maior-preco": {
          const byPrice = be - ae;
          return byPrice !== 0
            ? byPrice
            : a.name.localeCompare(b.name, "pt-BR");
        }
        case "maior-desconto":
          return bd - ad;
        case "antigos":
          return a.createdAt.getTime() - b.createdAt.getTime();
        case "nome":
          return a.name.localeCompare(b.name, "pt-BR");
        case "marca":
          return a.brand.name.localeCompare(b.brand.name, "pt-BR");
        case "prioridade":
          return (
            (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)
          );
        case "recentes":
        default:
          return b.createdAt.getTime() - a.createdAt.getTime();
      }
    });

    const total = list.length;
    const start = (filters.page - 1) * filters.perPage;
    const items = list.slice(start, start + filters.perPage);

    return {
      items,
      meta: {
        total,
        page: filters.page,
        perPage: filters.perPage,
        totalPages: Math.max(1, Math.ceil(total / filters.perPage)),
      },
    };
  },

  findById(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
  },

  create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({
      data,
      include: productInclude,
    });
  },

  update(id: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({
      where: { id },
      data,
      include: productInclude,
    });
  },

  delete(id: string) {
    return prisma.product.delete({ where: { id } });
  },

  findAllByUser(userId: string) {
    return prisma.product.findMany({
      where: { userId },
      include: productInclude,
    });
  },

  async replaceImages(
    productId: string,
    images: {
      imageUrl: string;
      imagePublicId: string;
      position: number;
      isMain: boolean;
    }[],
  ) {
    await prisma.productImage.deleteMany({ where: { productId } });
    if (!images.length) return [];
    await prisma.productImage.createMany({
      data: images.map((img) => ({ ...img, productId })),
    });
    return prisma.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
    });
  },

  async deleteImagesByIds(productId: string, ids: string[]) {
    if (!ids.length) return;
    await prisma.productImage.deleteMany({
      where: { productId, id: { in: ids } },
    });
  },

  async addImages(
    productId: string,
    images: {
      imageUrl: string;
      imagePublicId: string;
      position: number;
      isMain: boolean;
    }[],
  ) {
    if (!images.length) return;
    await prisma.productImage.createMany({
      data: images.map((img) => ({ ...img, productId })),
    });
  },

  async setMainImage(productId: string, imageId: string) {
    await prisma.productImage.updateMany({
      where: { productId },
      data: { isMain: false },
    });
    await prisma.productImage.updateMany({
      where: { productId, id: imageId },
      data: { isMain: true },
    });
  },

  listImages(productId: string) {
    return prisma.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
    });
  },

  async reindexImages(productId: string) {
    const images = await prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isMain: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    });
    for (let i = 0; i < images.length; i++) {
      await prisma.productImage.update({
        where: { id: images[i].id },
        data: { position: i },
      });
    }
    return prisma.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
    });
  },
};
