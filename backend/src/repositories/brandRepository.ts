import { prisma } from "../config/prisma.js";
import { slugify } from "../utils/constants.js";

export const brandRepository = {
  findByUser(userId: string) {
    return prisma.brand.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: {
        products: {
          include: { images: { orderBy: { position: "asc" } } },
        },
      },
    });
  },

  findBySlug(userId: string, slug: string) {
    return prisma.brand.findFirst({
      where: { userId, slug },
      include: {
        products: {
          include: { images: { orderBy: { position: "asc" } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  },

  findById(id: string) {
    return prisma.brand.findUnique({ where: { id } });
  },

  create(data: {
    userId: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    logoPublicId?: string | null;
  }) {
    return prisma.brand.create({ data });
  },

  async findOrCreate(userId: string, name: string) {
    const trimmed = name.trim();
    const slug = slugify(trimmed);

    // Same slug = same brand (Cotih / COTIH / cotih)
    const bySlug = await prisma.brand.findFirst({
      where: { userId, slug },
    });
    if (bySlug) return bySlug;

    const all = await prisma.brand.findMany({ where: { userId } });
    const byName = all.find(
      (b) => b.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (byName) return byName;

    return prisma.brand.create({
      data: {
        userId,
        name: trimmed,
        slug,
      },
    });
  },

  update(
    id: string,
    data: { name?: string; logoUrl?: string | null; logoPublicId?: string | null },
  ) {
    return prisma.brand.update({ where: { id }, data });
  },
};
