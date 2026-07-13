#!/usr/bin/env npx tsx
/**
 * Importa data/export-sqlite.json para o PostgreSQL atual (DATABASE_URL).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dumpPath = path.resolve(__dirname, "../data/export-sqlite.json");
const prisma = new PrismaClient();

type Dump = {
  users: Array<{
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    createdAt: string;
    updatedAt: string;
  }>;
  brands: Array<{
    id: string;
    userId: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    logoPublicId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  products: Array<{
    id: string;
    userId: string;
    brandId: string;
    name: string;
    category: string;
    store: string;
    originalPrice: number;
    promotionalPrice: number | null;
    purchaseUrl: string | null;
    imageUrl: string | null;
    imagePublicId: string | null;
    color: string | null;
    size: string | null;
    priority: string;
    status: string;
    notes: string | null;
    isFavorite?: boolean;
    purchasedPrice: number | null;
    purchasedAt: string | null;
    createdAt: string;
    updatedAt: string;
    images: Array<{
      id: string;
      imageUrl: string;
      imagePublicId: string;
      position: number;
      isMain: boolean;
      createdAt: string;
    }>;
  }>;
};

async function main() {
  if (!fs.existsSync(dumpPath)) {
    throw new Error(`Arquivo não encontrado: ${dumpPath}`);
  }
  const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8")) as Dump;

  for (const u of dump.users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash: u.passwordHash,
      },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
      },
    });
  }

  for (const b of dump.brands) {
    await prisma.brand.upsert({
      where: { userId_slug: { userId: b.userId, slug: b.slug } },
      update: {
        name: b.name,
        logoUrl: b.logoUrl,
        logoPublicId: b.logoPublicId,
      },
      create: {
        id: b.id,
        userId: b.userId,
        name: b.name,
        slug: b.slug,
        logoUrl: b.logoUrl,
        logoPublicId: b.logoPublicId,
      },
    });
  }

  for (const p of dump.products) {
    const existing = await prisma.product.findUnique({ where: { id: p.id } });
    if (existing) {
      await prisma.productImage.deleteMany({ where: { productId: p.id } });
      await prisma.product.update({
        where: { id: p.id },
        data: {
          name: p.name,
          category: p.category === "TOP/CORSET" ? "Tops e corsets" : p.category,
          store: p.store,
          brandId: p.brandId,
          originalPrice: p.originalPrice,
          promotionalPrice: p.promotionalPrice,
          purchaseUrl: p.purchaseUrl,
          imageUrl: p.imageUrl,
          imagePublicId: p.imagePublicId,
          color: p.color,
          size: p.size,
          priority: p.priority,
          status: p.status,
          notes: p.notes,
          isFavorite: p.isFavorite ?? false,
          purchasedPrice: p.purchasedPrice,
          purchasedAt: p.purchasedAt ? new Date(p.purchasedAt) : null,
        },
      });
    } else {
      await prisma.product.create({
        data: {
          id: p.id,
          userId: p.userId,
          brandId: p.brandId,
          name: p.name,
          category: p.category === "TOP/CORSET" ? "Tops e corsets" : p.category,
          store: p.store,
          originalPrice: p.originalPrice,
          promotionalPrice: p.promotionalPrice,
          purchaseUrl: p.purchaseUrl,
          imageUrl: p.imageUrl,
          imagePublicId: p.imagePublicId,
          color: p.color,
          size: p.size,
          priority: p.priority,
          status: p.status,
          notes: p.notes,
          isFavorite: p.isFavorite ?? false,
          purchasedPrice: p.purchasedPrice,
          purchasedAt: p.purchasedAt ? new Date(p.purchasedAt) : null,
        },
      });
    }

    if (p.images?.length) {
      await prisma.productImage.createMany({
        data: p.images.map((img) => ({
          id: img.id,
          productId: p.id,
          imageUrl: img.imageUrl,
          imagePublicId: img.imagePublicId,
          position: img.position,
          isMain: img.isMain,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log("Importação concluída:", {
    users: dump.users.length,
    brands: dump.brands.length,
    products: dump.products.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
