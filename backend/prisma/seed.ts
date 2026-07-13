import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");
const seedAssets = path.resolve(__dirname, "seed-assets/cotih");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copySeedImage(filename: string, destName: string) {
  ensureDir(uploadsDir);
  const src = path.join(seedAssets, filename);
  const dest = path.join(uploadsDir, destName);
  fs.copyFileSync(src, dest);
  return {
    imageUrl: `/uploads/${destName}`,
    imagePublicId: `local/${destName}`,
  };
}

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const demo = await prisma.user.upsert({
    where: { email: "demo@closet.local" },
    update: {},
    create: {
      name: "Camila Demo",
      email: "demo@closet.local",
      passwordHash,
    },
  });

  const camila = await prisma.user.upsert({
    where: { email: "camilagoulartsoares@yahoo.com" },
    update: { passwordHash, name: "Camila" },
    create: {
      name: "Camila",
      email: "camilagoulartsoares@yahoo.com",
      passwordHash,
    },
  });

  for (const user of [demo, camila]) {
    await seedCotihForUser(user.id);
  }

  console.log("Seed concluído.");
  console.log("Login: camilagoulartsoares@yahoo.com / demo1234");
  console.log("Login demo: demo@closet.local / demo1234");
}

async function seedCotihForUser(userId: string) {
  const brand = await prisma.brand.upsert({
    where: { userId_slug: { userId, slug: "cotih" } },
    update: { name: "Cotih" },
    create: {
      userId,
      name: "Cotih",
      slug: "cotih",
    },
  });

  const existingKim = await prisma.product.findFirst({
    where: {
      userId,
      name: "Calça Cargo Jeans Kim",
      brandId: brand.id,
    },
  });

  if (existingKim) return;

  const img1 = copySeedImage("01-main.jpg", "cotih-kim-01.jpg");
  const img2 = copySeedImage("02.jpg", "cotih-kim-02.jpg");
  const img3 = copySeedImage("03.jpg", "cotih-kim-03.jpg");

  await prisma.product.create({
    data: {
      userId,
      brandId: brand.id,
      name: "Calça Cargo Jeans Kim",
      category: "Calças",
      store: "Cotih",
      originalPrice: 309.9,
      promotionalPrice: 309.9,
      purchaseUrl:
        "https://www.cotih.com.br/produtos/calca-cargo-jeans-kim-gk18i/",
      imageUrl: img1.imageUrl,
      imagePublicId: img1.imagePublicId,
      priority: "Quero",
      status: "Quero comprar",
      notes:
        "Calça cargo jeans com modelagem reta ampla e bolsos utilitários.",
      images: {
        create: [
          { ...img1, position: 0, isMain: true },
          { ...img2, position: 1, isMain: false },
          { ...img3, position: 2, isMain: false },
        ],
      },
    },
  });
  console.log(`Calça Cargo Jeans Kim cadastrada para usuário ${userId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
