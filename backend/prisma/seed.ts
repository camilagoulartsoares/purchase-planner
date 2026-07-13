import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@closet.local";
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Camila Demo",
      email,
      passwordHash,
    },
  });

  const count = await prisma.product.count({ where: { userId: user.id } });
  if (count > 0) {
    console.log("Seed já aplicado.");
    return;
  }

  await prisma.product.createMany({
    data: [
      {
        userId: user.id,
        name: "Vestido midi floral",
        category: "Vestidos",
        brand: "Farm",
        store: "Farm Online",
        originalPrice: 449.9,
        promotionalPrice: 359.9,
        purchaseUrl: "https://www.farmrio.com.br",
        imageUrl:
          "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=600&q=80",
        color: "Rosa",
        size: "M",
        priority: "Quero muito",
        status: "Quero comprar",
        notes: "Para usar com calma, quando fizer sentido.",
      },
      {
        userId: user.id,
        name: "Sandália de salto bloco",
        category: "Calçados",
        brand: "Arezzo",
        store: "Arezzo",
        originalPrice: 299.9,
        promotionalPrice: null,
        purchaseUrl: "https://www.arezzo.com.br",
        imageUrl:
          "https://images.unsplash.com/photo-1543163521-1a2727199b1c?auto=format&fit=crop&w=600&q=80",
        color: "Caramelo",
        size: "37",
        priority: "Quero",
        status: "Esperando promoção",
      },
      {
        userId: user.id,
        name: "Blusa de linho",
        category: "Blusas",
        brand: "Zara",
        store: "Zara",
        originalPrice: 179.9,
        promotionalPrice: 129.9,
        imageUrl:
          "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=600&q=80",
        color: "Bege",
        size: "P",
        priority: "Talvez",
        status: "Já comprei",
        purchasedPrice: 129.9,
        purchasedAt: new Date(),
      },
    ],
  });

  console.log("Seed concluído.");
  console.log("Login demo: demo@closet.local / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
