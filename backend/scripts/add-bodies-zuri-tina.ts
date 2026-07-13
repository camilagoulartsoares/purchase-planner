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

  // Imagens 1–2 Zuri | 3–4 Tina (ordem dos anexos)
  const zuri1 = path.join(ASSETS, "image-b8fdf9e1-f765-465f-bdd8-e21ce23975f0.png");
  const zuri2 = path.join(ASSETS, "image-bdfe8eac-7562-404f-902e-7a4b958bceae.png");
  const tina1 = path.join(ASSETS, "image-ced42d52-19b5-4a73-9091-e1e6a231eb77.png");
  const tina2 = path.join(ASSETS, "image-defe5018-cfa2-4422-8567-8c81608dae86.png");

  for (const f of [zuri1, zuri2, tina1, tina2]) {
    if (!fs.existsSync(f)) throw new Error(`Imagem não encontrada: ${f}`);
  }

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Maiô/Body Zuri",
    purchaseUrl: "https://www.cotih.com.br/produtos/maio-body-zuri-d983x/",
    originalPrice: 149.9,
    promotionalPrice: 149.9,
    files: [
      asMulterFile(zuri1, "zuri-01.jpg"),
      asMulterFile(zuri2, "zuri-02.jpg"),
    ],
    notes: "Maiô/body com alças finas.",
    color: "Preto",
  });

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Tina",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-tina/",
    originalPrice: 99.9,
    promotionalPrice: 99.9,
    files: [
      asMulterFile(tina1, "tina-01.jpg"),
      asMulterFile(tina2, "tina-02.jpg"),
    ],
    notes: "Body básico alça fina.",
    color: "Variado",
  });

  const bodies = await prisma.product.findMany({
    where: { userId: user.id, brandId: brand.id, category: "Bodies" },
    orderBy: [{ originalPrice: "asc" }, { name: "asc" }],
    include: { images: true },
  });
  console.log("Bodies Cotih (menor → maior preço):");
  for (const p of bodies) {
    console.log(
      `  ${p.name} | R$ ${Number(p.originalPrice)} | ${p.images.length} fotos`,
    );
  }

  backupService.create("bodies-zuri-tina");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
