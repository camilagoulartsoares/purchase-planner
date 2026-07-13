import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { effectivePrice } from "../utils/constants.js";

export type ProductFilters = {
  search?: string;
  category?: string;
  brand?: string;
  store?: string;
  color?: string;
  size?: string;
  priority?: string;
  status?: string;
  promo?: "com" | "sem" | "";
  minPrice?: number;
  maxPrice?: number;
  priceBand?: string;
  sort?: string;
  page: number;
  perPage: number;
};

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

export const productRepository = {
  async findMany(userId: string, filters: ProductFilters) {
    const where: Prisma.ProductWhereInput = { userId };

    if (filters.category) where.category = filters.category;
    if (filters.brand) where.brand = filters.brand;
    if (filters.store) where.store = filters.store;
    if (filters.color) where.color = filters.color;
    if (filters.size) where.size = filters.size;
    if (filters.priority) where.priority = filters.priority;
    if (filters.status) where.status = filters.status;

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { brand: { contains: filters.search, mode: "insensitive" } },
        { store: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    // Fetch then filter by effective price / promo in memory for Decimal accuracy
    // but still scoped by userId - for small/medium lists. For proper SQL we'd use raw.
    // Given requirement for backend filtering, we apply price filters after load of user products
    // matching basic where, then paginate.
    const all = await prisma.product.findMany({ where, orderBy: { createdAt: "desc" } });

    const band = bandRange(filters.priceBand);
    let list = all.filter((p) => {
      const original = Number(p.originalPrice);
      const promo = p.promotionalPrice != null ? Number(p.promotionalPrice) : null;
      const price = effectivePrice(original, promo);
      const hasPromo =
        promo != null && promo > 0 && promo < original;

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
      const ae = effectivePrice(ao, ap);
      const be = effectivePrice(bo, bp);
      const ad =
        ap != null && ap < ao ? Math.round(((ao - ap) / ao) * 100) : 0;
      const bd =
        bp != null && bp < bo ? Math.round(((bo - bp) / bo) * 100) : 0;

      switch (filters.sort) {
        case "menor-preco":
          return ae - be;
        case "maior-preco":
          return be - ae;
        case "maior-desconto":
          return bd - ad;
        case "antigos":
          return a.createdAt.getTime() - b.createdAt.getTime();
        case "nome":
          return a.name.localeCompare(b.name, "pt-BR");
        case "marca":
          return a.brand.localeCompare(b.brand, "pt-BR");
        case "prioridade":
          return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
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
    return prisma.product.findUnique({ where: { id } });
  },

  create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({ data });
  },

  update(id: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.product.delete({ where: { id } });
  },

  findAllByUser(userId: string) {
    return prisma.product.findMany({ where: { userId } });
  },
};
