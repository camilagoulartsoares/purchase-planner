import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../config/prisma.js";

const app = createApp();

describe("API Closet", () => {
  let tokenA = "";
  let tokenB = "";
  let productId = "";
  let discountedProductId = "";

  const createProduct = (token: string, data: Record<string, string>) =>
    request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", data.name)
      .field("category", data.category)
      .field("brand", data.brand)
      .field("store", data.store)
      .field("originalPrice", data.originalPrice)
      .field("promotionalPrice", data.promotionalPrice || "")
      .field("shippingPrice", data.shippingPrice || "")
      .field("priority", data.priority)
      .field("status", data.status);

  beforeAll(async () => {
    await prisma.productImage.deleteMany();
    await prisma.product.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.user.deleteMany();
  });

  it("cadastra e autentica usuário", async () => {
    const reg = await request(app).post("/api/auth/register").send({
      name: "Usuária A",
      email: "a@test.com",
      password: "senha123",
    });
    expect(reg.status).toBe(201);
    tokenA = reg.body.data.token;

    const regB = await request(app).post("/api/auth/register").send({
      name: "Usuária B",
      email: "b@test.com",
      password: "senha123",
    });
    tokenB = regB.body.data.token;

    const login = await request(app).post("/api/auth/login").send({
      email: "a@test.com",
      password: "senha123",
    });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeTruthy();
  });

  it("cria produto e aplica filtro de preço", async () => {
    const created = await createProduct(tokenA, {
      name: "Saia plissada",
      category: "Saias",
      brand: "Reservado",
      store: "Loja X",
      originalPrice: "220",
      promotionalPrice: "180",
      priority: "Quero",
      status: "Quero comprar",
    });

    expect(created.status).toBe(201);
    productId = created.body.data.id;

    const filtered = await request(app)
      .get("/api/products")
      .query({ minPrice: 150, maxPrice: 200 })
      .set("Authorization", `Bearer ${tokenA}`);

    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items.some((i: { id: string }) => i.id === productId)).toBe(
      true,
    );
  });

  it("ignora filtros de preço vazios enviados pela tela inicial", async () => {
    const res = await request(app)
      .get("/api/products")
      .query({
        status: "Quero comprar",
        minPrice: "",
        maxPrice: "",
        page: "1",
        perPage: "12",
      })
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((i: { id: string }) => i.id === productId)).toBe(
      true,
    );
  });

  it("ordena produtos pelo maior desconto", async () => {
    const created = await createProduct(tokenA, {
      name: "Vestido linho",
      category: "Vestidos",
      brand: "Aurora",
      store: "Loja Y",
      originalPrice: "300",
      promotionalPrice: "150",
      priority: "Quero muito",
      status: "Quero comprar",
    });

    expect(created.status).toBe(201);
    discountedProductId = created.body.data.id;

    const sorted = await request(app)
      .get("/api/products")
      .query({ sort: "maior-desconto", status: "Quero comprar" })
      .set("Authorization", `Bearer ${tokenA}`);

    expect(sorted.status).toBe(200);
    expect(sorted.body.data.items[0]).toMatchObject({
      id: discountedProductId,
      discountPercent: 50,
      hasPromo: true,
    });
  });

  it("soma frete no preço efetivo quando informado", async () => {
    const created = await createProduct(tokenA, {
      name: "Bolsa tiracolo",
      category: "Bolsas",
      brand: "Aurora",
      store: "Loja Y",
      originalPrice: "260",
      promotionalPrice: "200",
      shippingPrice: "25,22",
      priority: "Quero",
      status: "Quero comprar",
    });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      shippingPrice: 25.22,
      effectivePrice: 225.22,
      discountPercent: 23,
    });
  });

  it("resume wishlist com totais, economia e contadores por status", async () => {
    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({
      wantCount: 3,
      boughtCount: 0,
      waitingCount: 0,
      wishTotal: 555.22,
      spentTotal: 0,
      savedTotal: 190,
      counts: {
        "Quero comprar": 3,
        "Esperando promoção": 0,
        "Já comprei": 0,
        "Desisti da compra": 0,
      },
    });
  });

  it("filtra produtos favoritos", async () => {
    const before = await request(app)
      .get("/api/products")
      .query({ favorite: "true" })
      .set("Authorization", `Bearer ${tokenA}`);

    expect(before.status).toBe(200);
    expect(before.body.data.items.some((i: { id: string }) => i.id === productId)).toBe(
      false,
    );

    const toggled = await request(app)
      .patch(`/api/products/${productId}/favorite`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(toggled.status).toBe(200);
    expect(toggled.body.data.isFavorite).toBe(true);

    const after = await request(app)
      .get("/api/products")
      .query({ favorite: "true" })
      .set("Authorization", `Bearer ${tokenA}`);

    expect(after.status).toBe(200);
    expect(after.body.data.items.some((i: { id: string }) => i.id === productId)).toBe(
      true,
    );
  });

  it("registra compra e atualiza o resumo financeiro", async () => {
    const bought = await request(app)
      .patch(`/api/products/${discountedProductId}/status`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        status: "Já comprei",
        purchasedPrice: 140,
        purchasedAt: "2026-07-15",
        notes: "Compra registrada pelo planner",
      });

    expect(bought.status).toBe(200);
    expect(bought.body.data).toMatchObject({
      id: discountedProductId,
      status: "Já comprei",
      purchasedPrice: 140,
      notes: "Compra registrada pelo planner",
    });

    const summary = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({
      wantCount: 2,
      boughtCount: 1,
      wishTotal: 405.22,
      spentTotal: 140,
      savedTotal: 190,
      counts: {
        "Quero comprar": 2,
        "Já comprei": 1,
      },
    });
  });

  it("impede acesso ao produto de outro usuário", async () => {
    const res = await request(app)
      .get(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});
