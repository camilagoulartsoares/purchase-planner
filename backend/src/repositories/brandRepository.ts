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

  async findOrCreate(userId: string, name: string) {
    const trimmed = name.trim();
    const existing = await prisma.brand.findFirst({
      where: { userId, name: trimmed },
    });
    if (existing) return existing;

    let slug = slugify(trimmed);
    const clash = await prisma.brand.findFirst({ where: { userId, slug } });
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;

    return prisma.brand.create({
      data: { userId, name: trimmed, slug },
    });
  },
};
