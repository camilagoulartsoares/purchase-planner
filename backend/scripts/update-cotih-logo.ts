#!/usr/bin/env npx tsx
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { imageService } from "../src/services/imageService.js";

const prisma = new PrismaClient();
const LOGO =
  "/home/camila/.cursor/projects/home-camila-rea-de-trabalho-Dealsafe-dealsafe-frontend/assets/image-45749d8c-25e5-4e11-b722-91bf4eb6f376.png";
const EMAIL = "camilagoulartsoares@yahoo.com";

function asMulterFile(filePath: string): Express.Multer.File {
  const buffer = fs.readFileSync(filePath);
  return {
    fieldname: "logo",
    originalname: "cotih-logo.png",
    encoding: "7bit",
    mimetype: "image/png",
    size: buffer.length,
    buffer,
    destination: "",
    filename: "cotih-logo.png",
    path: filePath,
    stream: undefined as never,
  };
}

async function main() {
  if (!fs.existsSync(LOGO)) throw new Error(`Logo não encontrada: ${LOGO}`);
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error("Usuário não encontrado");

  const brand = await prisma.brand.findFirst({
    where: { userId: user.id, slug: "cotih" },
  });
  if (!brand) throw new Error("Marca Cotih não encontrada");

  if (brand.logoPublicId) {
    await imageService.remove(brand.logoPublicId);
  }

  const uploaded = await imageService.upload(asMulterFile(LOGO));
  await prisma.brand.update({
    where: { id: brand.id },
    data: {
      logoUrl: uploaded.imageUrl,
      logoPublicId: uploaded.imagePublicId,
    },
  });
  console.log("Logo Cotih atualizada:", uploaded.imageUrl);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
