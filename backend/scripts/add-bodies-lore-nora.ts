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

  // Imagens 1–2 Lore | 3–4 Nora (ordem dos anexos)
  const lore1 = path.join(ASSETS, "image-778ed52a-2163-4960-8d30-c1c264ad5862.png");
  const lore2 = path.join(ASSETS, "image-3d55c687-ffb9-4424-9551-f4502b1caf49.png");
  const nora1 = path.join(ASSETS, "image-b1195430-8429-4a14-ab3a-271122bc3b17.png");
  const nora2 = path.join(ASSETS, "image-8be7669a-7ecc-448b-9ad6-8d1ddcd78b48.png");

  for (const f of [lore1, lore2, nora1, nora2]) {
    if (!fs.existsSync(f)) throw new Error(`Imagem não encontrada: ${f}`);
  }

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Básico Lore",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-basico-lore/",
    originalPrice: 109.9,
    promotionalPrice: 109.9,
    files: [
      asMulterFile(lore1, "lore-01.jpg"),
      asMulterFile(lore2, "lore-02.jpg"),
    ],
    notes: "Body básico regata.",
    color: "Azul marinho",
  });

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Nora",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-nora-8s8d9/",
    originalPrice: 109.9,
    promotionalPrice: 109.9,
    files: [
      asMulterFile(nora1, "nora-01.jpg"),
      asMulterFile(nora2, "nora-02.jpg"),
    ],
    notes: "Body manga curta com costas abertas.",
    color: "Preto",
  });

  const bodies = await prisma.product.findMany({
    where: { userId: user.id, brandId: brand.id, category: "Bodies" },
    orderBy: [{ originalPrice: "desc" }, { name: "asc" }],
    include: { images: true },
  });
  console.log("Bodies Cotih:");
  for (const p of bodies) {
    console.log(
      `  ${p.name} | R$ ${Number(p.originalPrice)} | ${p.images.length} fotos`,
    );
  }

  backupService.create("bodies-lore-nora");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
