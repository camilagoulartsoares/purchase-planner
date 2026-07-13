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

  // Imagens 1–2 Lira | 3–4 Koli | 5–6 Lani (ordem dos anexos)
  const lira1 = path.join(ASSETS, "image-6045af9a-6648-4b61-9081-5410617f2265.png");
  const lira2 = path.join(ASSETS, "image-370c6156-467b-4fde-bb87-2331d25c2a1f.png");
  const koli1 = path.join(ASSETS, "image-1f1d4a87-12ef-4b5f-8915-17688d8fb02c.png");
  const koli2 = path.join(ASSETS, "image-4c3e92ec-c5ac-40e9-b8c7-99cc1f99439e.png");
  const lani1 = path.join(ASSETS, "image-ae0fd3eb-9ef2-4e2a-8473-2c55fc5929d8.png");
  const lani2 = path.join(ASSETS, "image-eec67884-58fa-4c17-97a4-c8c710c65313.png");

  for (const f of [lira1, lira2, koli1, koli2, lani1, lani2]) {
    if (!fs.existsSync(f)) throw new Error(`Imagem não encontrada: ${f}`);
  }

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Básico Lira",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-basico-lira/",
    originalPrice: 109.9,
    promotionalPrice: 109.9,
    files: [
      asMulterFile(lira1, "lira-01.jpg"),
      asMulterFile(lira2, "lira-02.jpg"),
    ],
    notes: "Body básico Lira.",
    color: "Preto",
  });

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Básico Koli Decote Costas",
    purchaseUrl:
      "https://www.cotih.com.br/produtos/body-basico-koli-decote-costas-4i6lt/",
    originalPrice: 109.9,
    promotionalPrice: 109.9,
    files: [
      asMulterFile(koli1, "koli-01.jpg"),
      asMulterFile(koli2, "koli-02.jpg"),
    ],
    notes: "Body básico com decote nas costas.",
    color: "Preto",
  });

  await ensureProduct({
    userId: user.id,
    brandId: brand.id,
    name: "Body Básico Lani",
    purchaseUrl: "https://www.cotih.com.br/produtos/body-basico-lani/",
    originalPrice: 139.9,
    promotionalPrice: 139.9,
    files: [
      asMulterFile(lani1, "lani-01.jpg"),
      asMulterFile(lani2, "lani-02.jpg"),
    ],
    notes: "Body básico Lani.",
    color: "Preto",
  });

  const novos = await prisma.product.findMany({
    where: {
      userId: user.id,
      brandId: brand.id,
      name: {
        in: [
          "Body Básico Lira",
          "Body Básico Koli Decote Costas",
          "Body Básico Lani",
        ],
      },
    },
    orderBy: [{ originalPrice: "asc" }, { name: "asc" }],
    include: { images: true },
  });
  console.log("Novos Bodies (menor → maior, depois A–Z):");
  for (const p of novos) {
    console.log(
      `  ${p.name} | R$ ${Number(p.originalPrice)} | ${p.images.length} fotos`,
    );
  }

  const allBodies = await prisma.product.count({
    where: { userId: user.id, brandId: brand.id, category: "Bodies" },
  });
  console.log(`Total Bodies Cotih: ${allBodies}`);

  backupService.create("bodies-lira-koli-lani");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
