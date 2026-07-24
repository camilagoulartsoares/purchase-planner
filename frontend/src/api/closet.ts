import api from "./client";
import type {
  BrandSummary,
  MercadoLivreConnectResponse,
  MercadoLivreIntegrationStatus,
  MercadoLivrePublicConfig,
  MercadoLivreSyncResponse,
  Product,
  ProductQuery,
  PromoRadarResponse,
  Summary,
  User,
  Finding,
  FindingInput,
} from "../types";

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

export async function fetchPromoRadar() {
  const res = await api.get("/dashboard/promo-radar", { timeout: 60000 });
  return res.data.data as PromoRadarResponse;
}

export async function fetchPromotionMedia(url: string) {
  try {
    const res = await api.get("/dashboard/promo-media", { params: { url } });
    const media = res.data.data as Array<{ type: "image" | "video"; url: string }>;
    if (media.length) return media;
  } catch {
  }
  const response = await fetch(`/api/promo-media?url=${encodeURIComponent(url)}`);
  if (!response.ok) return [];
  return ((await response.json()) as { data?: Array<{ type: "image" | "video"; url: string }> }).data || [];
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

export async function fetchMercadoLivrePublicConfig() {
  const res = await api.get("/integrations/mercadolivre/public-config");
  return res.data.data as MercadoLivrePublicConfig;
}

export async function fetchMercadoLivreStatus() {
  const res = await api.get("/integrations/mercadolivre/status");
  return res.data.data as MercadoLivreIntegrationStatus;
}

export async function createMercadoLivreConnect(redirectTo?: string) {
  const res = await api.get("/integrations/mercadolivre/connect", {
    params: redirectTo ? { redirectTo } : undefined,
  });
  return res.data.data as MercadoLivreConnectResponse;
}

export async function syncMercadoLivreFavorites() {
  const res = await api.post("/integrations/mercadolivre/sync-favorites");
  return res.data.data as MercadoLivreSyncResponse;
}

export async function disconnectMercadoLivre() {
  const res = await api.delete("/integrations/mercadolivre/disconnect");
  return res.data.data as { disconnected: true };
}

export async function previewFinding(url: string) {
  const res = await api.post("/findings/preview", { url }, { timeout: 30000 });
  return res.data.data as FindingInput & { normalizedUrl: string };
}

export async function fetchFindings() {
  const res = await api.get("/findings");
  return res.data.data as Finding[];
}

export async function createFinding(data: FindingInput) {
  const res = await api.post("/findings", data);
  return res.data.data as Finding;
}

export async function updateFinding(id: string, data: Partial<FindingInput>) {
  const res = await api.put(`/findings/${id}`, data);
  return res.data.data as Finding;
}

export async function deleteFinding(id: string) {
  await api.delete(`/findings/${id}`);
}
