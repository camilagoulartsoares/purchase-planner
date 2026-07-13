#!/usr/bin/env npx tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { imageService } from "../src/services/imageService.js";
import { backupService } from "../src/services/backupService.js";
import { cloudinaryConfigured } from "../src/config/env.js";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    where: {
      userId: opts.userId,
      brandId: opts.brandId,
      name: opts.name,
    },
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
  console.log(`Criado: ${opts.name} (${uploads.length} fotos, cloudinary=${cloudinaryConfigured()})`);
  console.log(
    "  urls:",
    uploads.map((u) => u.imageUrl),
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

  const emma1 = path.join(ASSETS, "image-71c4a65e-9c38-4391-879a-aa984fe4cf84.png");
  const emma2 = path.join(ASSETS, "image-7855f3d0-adff-4d29-a84c-f8c5a4b6786c.png");
  const kali1 = path.join(ASSETS, "image-d84aad56-02d2-463d-a6bb-d7839f9847af.png");
  const kali2 = path.join(ASSETS, "image-59232547-4799-49d8-863c-40c63c53c4d6.png");

  for (const f of [emma1, emma2, kali1, kali2]) {
    if (!fs.existsSync(f)) throw new Error(`Imagem não encontrada: ${f}`);
  }

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Básico Emma",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-basico-emma/",
    originalPrice: 139.9,
    promotionalPrice: 139.9,
    files: [
      asMulterFile(emma1, "emma-01.jpg"),
      asMulterFile(emma2, "emma-02.jpg"),
    ],
    notes: "Body básico de manga longa e gola alta.",
    color: "Preto",
  });

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Básico Kali",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-basico-kali/",
    originalPrice: 109.9,
    promotionalPrice: 109.9,
    files: [
      asMulterFile(kali1, "kali-01.jpg"),
      asMulterFile(kali2, "kali-02.jpg"),
    ],
    notes: "Body básico regata.",
    color: "Preto",
  });

  backupService.create("bodies-emma-kali");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
