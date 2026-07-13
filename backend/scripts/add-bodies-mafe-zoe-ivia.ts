#!/usr/bin/env npx tsx
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { imageService } from "../src/services/imageService.js";
import { backupService } from "../src/services/backupService.js";
import { cloudinaryConfigured } from "../src/config/env.js";

const prisma = new PrismaClient();

const ASSETS =
  "/home/camila/.cursor/projects/home-camila-rea-de-trabalho-Dealsafe-dealsafe-frontend/assets";
const EMAIL = "camilagoulartsoares@yahoo.com";

function asMulterFile(filePath: string, name: string): Express.Multer.File {
  const buffer = fs.readFileSync(filePath);
  return {
    fieldname: "images",
    originalname: name,
    encoding: "7bit",
    mimetype: "image/jpeg",
    size: buffer.length,
    buffer,
    destination: "",
    filename: name,
    path: filePath,
    stream: undefined as never,
  };
}

async function ensureProduct(opts: {
  userId: string;
  brandId: string;
  name: string;
  purchaseUrl: string;
  originalPrice: number;
  promotionalPrice: number;
  files: Express.Multer.File[];
  notes: string;
  color: string;
}) {
  const byName = await prisma.product.findFirst({
    where: { userId: opts.userId, brandId: opts.brandId, name: opts.name },
  });
  const byUrl = await prisma.product.findFirst({
    where: {
      userId: opts.userId,
      brandId: opts.brandId,
      purchaseUrl: opts.purchaseUrl,
    },
  });
  if (byName || byUrl) {
    console.log(`Já existe, não duplicar: ${opts.name}`);
    return;
  }

  const uploads = await imageService.uploadMany(opts.files);
  const main = uploads[0];

  await prisma.product.create({
    data: {
      userId: opts.userId,
      brandId: opts.brandId,
      name: opts.name,
      category: "Bodies",
      store: "Cotih",
      originalPrice: opts.originalPrice,
      promotionalPrice: opts.promotionalPrice,
      purchaseUrl: opts.purchaseUrl,
      imageUrl: main.imageUrl,
      imagePublicId: main.imagePublicId,
      color: opts.color,
      priority: "Quero",
      status: "Quero comprar",
      notes: opts.notes,
      images: {
        create: uploads.map((img, index) => ({
          imageUrl: img.imageUrl,
          imagePublicId: img.imagePublicId,
          position: index,
          isMain: index === 0,
        })),
      },
    },
  });
  console.log(
    `Criado: ${opts.name} (${uploads.length} fotos, cloudinary=${cloudinaryConfigured()})`,
  );
}

async function main() {
  backupService.ensureDataDirs();

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`Usuário não encontrado: ${EMAIL}`);

  const brand = await prisma.brand.findFirst({
    where: { userId: user.id, slug: "cotih" },
  });
  if (!brand) throw new Error("Marca Cotih não encontrada");

  // Imagens 1–2 Mafe | 3–4 Zoe | 5–6 Ivia (ordem dos anexos)
  const mafe1 = path.join(ASSETS, "image-2b164d94-61dd-492e-8563-acdb5f96db46.png");
  const mafe2 = path.join(ASSETS, "image-a2e79ace-f8f3-4829-983a-c1c95ed0347f.png");
  const zoe1 = path.join(ASSETS, "image-1d358fa6-8fae-4ae8-b398-82eac641f658.png");
  const zoe2 = path.join(ASSETS, "image-175f7f19-7377-46eb-a69b-362d7c008931.png");
  const ivia1 = path.join(ASSETS, "image-3b510a6c-bd81-4a18-ba59-199a77e0dd7c.png");
  const ivia2 = path.join(ASSETS, "image-f2c89fe3-d411-45e7-904a-7ca18d626dde.png");

  for (const f of [mafe1, mafe2, zoe1, zoe2, ivia1, ivia2]) {
    if (!fs.existsSync(f)) throw new Error(`Imagem não encontrada: ${f}`);
  }

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Mafe",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-mafe/",
    originalPrice: 99.9,
    promotionalPrice: 99.9,
    files: [
      asMulterFile(mafe1, "mafe-01.jpg"),
      asMulterFile(mafe2, "mafe-02.jpg"),
    ],
    notes: "Body tomara que caia.",
    color: "Marrom",
  });

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Básico Zoe",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-basico-zoe/",
    originalPrice: 139.9,
    promotionalPrice: 139.9,
    files: [
      asMulterFile(zoe1, "zoe-01.jpg"),
      asMulterFile(zoe2, "zoe-02.jpg"),
    ],
    notes: "Body básico Zoe.",
    color: "Variado",
  });

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Básico Ivia",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-basico-ivia/",
    originalPrice: 129.9,
    promotionalPrice: 129.9,
    files: [
      asMulterFile(ivia1, "ivia-01.jpg"),
      asMulterFile(ivia2, "ivia-02.jpg"),
    ],
    notes: "Body básico Ivia manga única.",
    color: "Azul marinho",
  });

  const novos = await prisma.product.findMany({
    where: {
      userId: user.id,
      brandId: brand.id,
      name: { in: ["Body Mafe", "Body Básico Zoe", "Body Básico Ivia"] },
    },
    orderBy: [{ originalPrice: "asc" }, { name: "asc" }],
    include: { images: true },
  });
  console.log("Novos Bodies (menor → maior):");
  for (const p of novos) {
    console.log(
      `  ${p.name} | R$ ${Number(p.originalPrice)} | ${p.images.length} fotos`,
    );
  }

  const total = await prisma.product.count({
    where: { userId: user.id, brandId: brand.id, category: "Bodies" },
  });
  console.log(`Total Bodies Cotih: ${total}`);

  backupService.create("bodies-mafe-zoe-ivia");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
