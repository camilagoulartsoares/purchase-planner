import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../config/prisma.js";

const app = createApp();

describe("API Closet", () => {
  let tokenA = "";
  let tokenB = "";
  let productId = "";

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
    const created = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${tokenA}`)
      .field("name", "Saia plissada")
      .field("category", "Saias")
      .field("brand", "Reservado")
      .field("store", "Loja X")
      .field("originalPrice", "220")
      .field("promotionalPrice", "180")
      .field("priority", "Quero")
      .field("status", "Quero comprar");

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

  it("impede acesso ao produto de outro usuário", async () => {
    const res = await request(app)
      .get(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});
