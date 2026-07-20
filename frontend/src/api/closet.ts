import api from "./client";
import type { BrandSummary, Product, ProductQuery, Summary, User } from "../types";

export async function register(data: { name: string; email: string; password: string }) {
  const res = await api.post("/auth/register", data);
  return res.data.data as { token: string; user: User };
}

export async function login(data: { email: string; password: string }) {
  const res = await api.post("/auth/login", data);
  return res.data.data as { token: string; user: User };
}

export async function me() {
  const res = await api.get("/auth/me");
  return res.data.data as User;
}

export async function fetchSummary() {
  const res = await api.get("/dashboard/summary");
  return res.data.data as Summary;
}

export async function fetchProducts(params: ProductQuery) {
  const res = await api.get("/products", { params });
  return res.data.data as {
    items: Product[];
    meta: { total: number; page: number; perPage: number; totalPages: number };
  };
}

export async function fetchProduct(id: string) {
  const res = await api.get(`/products/${id}`);
  return res.data.data as Product;
}

export async function fetchBrands() {
  const res = await api.get("/brands");
  return res.data.data as BrandSummary[];
}

export async function createBrand(form: FormData) {
  const res = await api.post("/brands", form);
  return res.data.data as BrandSummary;
}

export async function fetchBrand(slug: string, category?: string) {
  const res = await api.get(`/brands/${slug}`, {
    params: category ? { category } : undefined,
  });
  return res.data.data as BrandSummary;
}

export async function saveProduct(form: FormData, id?: string) {
  const res = id
    ? await api.put(`/products/${id}`, form)
    : await api.post("/products", form);
  return res.data.data as Product;
}

export async function patchStatus(
  id: string,
  body: {
    status: string;
    purchasedPrice?: number;
    purchasedAt?: string;
    notes?: string;
    repurchase?: boolean;
  },
) {
  const res = await api.patch(`/products/${id}/status`, body);
  return res.data.data as Product;
}

export async function deleteProduct(id: string) {
  await api.delete(`/products/${id}`);
}

export async function toggleFavorite(id: string) {
  const res = await api.patch(`/products/${id}/favorite`);
  return res.data.data as Product;
}
