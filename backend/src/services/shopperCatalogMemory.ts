import { Prisma } from "@prisma/client";
import { offerPriceStatus, shopperRuntime } from "../config/shopperRuntime.js";
import { prisma } from "../config/prisma.js";
import type { SearchedProduct, ShopperQuery } from "./productSearchProvider.js";
import { compatibleProductIntent, evaluateProductMatch, productIntentKey, shopperTokens } from "./shopperIntentService.js";

export type CatalogProductRecord = {
  id: string;
  identityKey: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  googleProductId: string | null;
  detailToken: string | null;
  identityExpiresAt: string;
  offers: CatalogOfferRecord[];
};

export type CatalogOfferRecord = {
  offerKey: string;
  payload: SearchedProduct;
  priceCheckedAt: string;
};

export type CatalogQueryRecord = {
  id: string;
  originalQuery: string;
  intentKey: string;
  intent: ShopperQuery;
  discoveredAt: string;
  mapExpiresAt: string;
  productIds: string[];
};

export type ShopperCatalogStore = {
  listQueries(userId: string): Promise<CatalogQueryRecord[]>;
  listProducts(userId: string): Promise<CatalogProductRecord[]>;
  saveQuery(userId: string, record: Omit<CatalogQueryRecord, "id" | "productIds">, productIds: string[]): Promise<string>;
  saveProduct(userId: string, record: Omit<CatalogProductRecord, "id" | "offers">): Promise<string>;
  saveOffer(catalogProductId: string, record: CatalogOfferRecord): Promise<void>;
  linkQueryProduct(queryId: string, productId: string): Promise<void>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createInMemoryShopperCatalogStore(): ShopperCatalogStore {
  type QueryRow = CatalogQueryRecord & { userId: string };
  type ProductRow = CatalogProductRecord & { userId: string };
  const queries = new Map<string, QueryRow>();
  const products = new Map<string, ProductRow>();
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  return {
    async listQueries(userId) {
      return [...queries.values()].filter((item) => item.userId === userId).map((item) => clone(item));
    },
    async listProducts(userId) {
      return [...products.values()].filter((item) => item.userId === userId).map((item) => clone({ ...item, offers: item.offers.map((offer) => clone(offer)) }));
    },
    async saveQuery(userId, record, productIds) {
      const existing = [...queries.values()].find((item) => item.userId === userId && item.intentKey === record.intentKey);
      const id = existing?.id || nextId("query");
      queries.set(id, { ...record, id, userId, productIds: [...new Set([...(existing?.productIds || []), ...productIds])] });
      return id;
    },
    async saveProduct(userId, record) {
      const existing = [...products.values()].find((item) => item.userId === userId && item.identityKey === record.identityKey);
      const id = existing?.id || nextId("product");
      products.set(id, { ...existing, ...record, id, userId, offers: existing?.offers || [] });
      return id;
    },
    async saveOffer(catalogProductId, record) {
      const product = products.get(catalogProductId);
      if (!product) return;
      product.offers = [...product.offers.filter((item) => item.offerKey !== record.offerKey && !(item.payload.productUrl === record.payload.productUrl && item.payload.store === record.payload.store)), clone(record)];
    },
    async linkQueryProduct(queryId, productId) {
      const query = queries.get(queryId);
      if (!query) return;
      query.productIds = [...new Set([...query.productIds, productId])];
    },
  };
}

function json(value: unknown) { return value as Prisma.InputJsonValue; }

export const prismaShopperCatalogStore: ShopperCatalogStore = {
  async listQueries(userId) {
    const rows = await prisma.shopperCatalogQuery.findMany({ where: { userId }, include: { products: true } });
    return rows.map((row) => ({
      id: row.id,
      originalQuery: row.originalQuery,
      intentKey: row.intentKey,
      intent: row.intent as ShopperQuery,
      discoveredAt: row.discoveredAt.toISOString(),
      mapExpiresAt: row.mapExpiresAt.toISOString(),
      productIds: row.products.map((item) => item.productId),
    }));
  },
  async listProducts(userId) {
    const rows = await prisma.shopperCatalogProduct.findMany({ where: { userId }, include: { offers: true } });
    return rows.map((row) => ({
      id: row.id,
      identityKey: row.identityKey,
      title: row.title,
      brand: row.brand,
      imageUrl: row.imageUrl,
      googleProductId: row.googleProductId,
      detailToken: row.detailToken,
      identityExpiresAt: row.identityExpiresAt.toISOString(),
      offers: row.offers.map((offer) => ({ offerKey: offer.offerKey, payload: offer.payload as SearchedProduct, priceCheckedAt: offer.priceCheckedAt.toISOString() })),
    }));
  },
  async saveQuery(userId, record, productIds) {
    const existing = await prisma.shopperCatalogQuery.findFirst({ where: { userId, intentKey: record.intentKey } });
    const saved = existing
      ? await prisma.shopperCatalogQuery.update({ where: { id: existing.id }, data: { originalQuery: record.originalQuery, intent: json(record.intent), discoveredAt: new Date(record.discoveredAt), mapExpiresAt: new Date(record.mapExpiresAt) } })
      : await prisma.shopperCatalogQuery.create({ data: { userId, originalQuery: record.originalQuery, intentKey: record.intentKey, intent: json(record.intent), discoveredAt: new Date(record.discoveredAt), mapExpiresAt: new Date(record.mapExpiresAt) } });
    for (const productId of productIds) {
      await prisma.shopperCatalogQueryProduct.upsert({ where: { queryId_productId: { queryId: saved.id, productId } }, update: {}, create: { queryId: saved.id, productId } });
    }
    return saved.id;
  },
  async saveProduct(userId, record) {
    const existing = await prisma.shopperCatalogProduct.findUnique({ where: { userId_identityKey: { userId, identityKey: record.identityKey } } });
    const data = {
      title: record.title,
      brand: record.brand,
      imageUrl: record.imageUrl,
      googleProductId: record.googleProductId,
      detailToken: record.detailToken,
      identityExpiresAt: new Date(record.identityExpiresAt),
    };
    const saved = existing
      ? await prisma.shopperCatalogProduct.update({ where: { id: existing.id }, data })
      : await prisma.shopperCatalogProduct.create({ data: { userId, identityKey: record.identityKey, discoveredAt: new Date(), ...data } });
    return saved.id;
  },
  async saveOffer(catalogProductId, record) {
    const payload = record.payload;
    await prisma.shopperCatalogOffer.deleteMany({
      where: { catalogProductId, productUrl: payload.productUrl, store: payload.store || "", NOT: { offerKey: record.offerKey } },
    });
    await prisma.shopperCatalogOffer.upsert({
      where: { catalogProductId_offerKey: { catalogProductId, offerKey: record.offerKey } },
      update: {
        store: payload.store || "",
        merchant: payload.merchant || null,
        price: payload.price,
        currency: payload.currency,
        productUrl: payload.productUrl,
        availability: payload.availability,
        source: payload.provider,
        title: payload.title,
        payload: json(payload),
        priceCheckedAt: new Date(record.priceCheckedAt),
      },
      create: {
        catalogProductId,
        offerKey: record.offerKey,
        store: payload.store || "",
        merchant: payload.merchant || null,
        price: payload.price,
        currency: payload.currency,
        productUrl: payload.productUrl,
        availability: payload.availability,
        source: payload.provider,
        title: payload.title,
        payload: json(payload),
        priceCheckedAt: new Date(record.priceCheckedAt),
        discoveredAt: new Date(),
      },
    });
  },
  async linkQueryProduct(queryId, productId) {
    await prisma.shopperCatalogQueryProduct.upsert({ where: { queryId_productId: { queryId, productId } }, update: {}, create: { queryId, productId } });
  },
};

const hardConflicts = new Set(["quantity_conflict", "size_conflict", "color_conflict", "gender_conflict", "brand_similarity_conflict"]);

export function catalogIdentityKey(item: SearchedProduct) {
  const tokens = shopperTokens([item.productTitle || item.title, item.brand || ""].join(" ")).sort();
  const quantities = tokens.filter((token) => /^\d+(?:ml|g|gb|tb|mm|cm)$/.test(token)).join("|");
  return `${item.productId || "listing"}:${quantities}:${tokens.join(" ")}`;
}

export function offerMemoryKey(item: SearchedProduct) {
  return `${item.productUrl}|${item.store || ""}`;
}

export type CatalogRecall = {
  used: boolean;
  reason: string;
  offers: SearchedProduct[];
  products: CatalogProductRecord[];
  discoveredAt: string | null;
  mapExpiresAt: string | null;
  oldestPriceCheckedAt: string | null;
  newestPriceCheckedAt: string | null;
};

function withFreshness(item: SearchedProduct, now = Date.now()): SearchedProduct {
  const checkedAt = item.checkedAt;
  return { ...item, priceStatus: offerPriceStatus(checkedAt, now) };
}

export function createShopperCatalogMemory(store: ShopperCatalogStore = prismaShopperCatalogStore, now = () => Date.now()) {
  return {
    async recall(userId: string, query: ShopperQuery): Promise<CatalogRecall> {
      const timestamp = now();
      const queries = await store.listQueries(userId);
      const products = await store.listProducts(userId);
      const liveProducts = products.filter((item) => Date.parse(item.identityExpiresAt) > timestamp);
      const compatibleQueries = queries.filter((item) => Date.parse(item.mapExpiresAt) > timestamp && compatibleProductIntent(item.intent, query));
      const selected = compatibleQueries.sort((a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt))[0];
      const related = selected
        ? liveProducts.filter((item) => selected.productIds.includes(item.id))
        : liveProducts.filter((item) => {
          const evaluation = evaluateProductMatch(item.title, query);
          return evaluation.eligible && !hardConflicts.has(evaluation.reason || "");
        });
      if (!related.length) return { used: false, reason: selected ? "compatible_map_without_live_products" : "no_compatible_memory", offers: [], products: [], discoveredAt: selected?.discoveredAt || null, mapExpiresAt: selected?.mapExpiresAt || null, oldestPriceCheckedAt: null, newestPriceCheckedAt: null };
      const offers = related.flatMap((product) => product.offers.map((offer) => withFreshness({ ...offer.payload, checkedAt: offer.priceCheckedAt }, timestamp)));
      if (!offers.length) return { used: false, reason: "compatible_products_without_offers", offers: [], products: related, discoveredAt: selected?.discoveredAt || null, mapExpiresAt: selected?.mapExpiresAt || null, oldestPriceCheckedAt: null, newestPriceCheckedAt: null };
      const checks = related.flatMap((product) => product.offers.map((offer) => offer.priceCheckedAt)).sort();
      return {
        used: true,
        reason: selected ? "compatible_intent_map" : "compatible_product_identity",
        offers,
        products: related,
        discoveredAt: selected?.discoveredAt || null,
        mapExpiresAt: selected?.mapExpiresAt || null,
        oldestPriceCheckedAt: checks[0] || null,
        newestPriceCheckedAt: checks.at(-1) || null,
      };
    },
    async remember(userId: string, query: ShopperQuery, offers: SearchedProduct[], candidates: Array<{ productId: string; token: string; title: string }> = [], options: { fullDiscovery?: boolean; discoveredAt?: string | null } = {}) {
      const timestamp = now();
      const productIds: string[] = [];
      const byIdentity = new Map<string, SearchedProduct[]>();
      for (const offer of offers) {
        const key = catalogIdentityKey(offer);
        const group = byIdentity.get(key) || [];
        group.push(offer);
        byIdentity.set(key, group);
      }
      for (const [identityKey, group] of byIdentity) {
        const lead = group[0];
        const candidate = candidates.find((item) => item.productId === lead.productId);
        const productId = await store.saveProduct(userId, {
          identityKey,
          title: lead.productTitle || lead.title,
          brand: lead.brand,
          imageUrl: lead.imageUrl,
          googleProductId: lead.productId || candidate?.productId || null,
          detailToken: candidate?.token || null,
          identityExpiresAt: new Date(timestamp + shopperRuntime.memory.identityTtlMs).toISOString(),
        });
        productIds.push(productId);
        for (const offer of group) {
          await store.saveOffer(productId, {
            offerKey: offerMemoryKey(offer),
            payload: offer,
            priceCheckedAt: offer.checkedAt || new Date(timestamp).toISOString(),
          });
        }
      }
      await store.saveQuery(userId, {
        originalQuery: query.query,
        intentKey: productIntentKey(query),
        intent: query,
        discoveredAt: options.fullDiscovery === false && options.discoveredAt ? options.discoveredAt : new Date(timestamp).toISOString(),
        mapExpiresAt: new Date(timestamp + shopperRuntime.memory.queryMapTtlMs).toISOString(),
      }, productIds);
    },
  };
}

export const shopperCatalogMemory = createShopperCatalogMemory();
