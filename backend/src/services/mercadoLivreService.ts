import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { env, mercadoLivreConfigured } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";
import { brandRepository } from "../repositories/brandRepository.js";
import { mercadoLivreRepository } from "../repositories/mercadoLivreRepository.js";
import { decryptSecret, encryptSecret, randomState } from "../utils/encryption.js";

const MARKETPLACE = "mercado_livre";
const BRAND_NAME = "Mercado Livre";
const DEFAULT_CATEGORY = "Outros achados";
const STATE_TTL_MS = 1000 * 60 * 15;
const LOCK_TTL_MS = 1000 * 60 * 10;
const AUTO_SYNC_INTERVAL_MS = 1000 * 60 * 30;
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 1000 * 60 * 5;

type IntegrationSyncStatus =
  | "idle"
  | "running"
  | "failed"
  | "permission_required"
  | "reconnect_required";

type MeliTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id: number | string;
  refresh_token: string;
};

type MeliUserResponse = {
  id: number | string;
  user_id?: number | string;
  nickname?: string;
  site_id?: string;
  email?: string;
};

type MeliBookmark = {
  bookmarked_date: string;
  item_id: string;
};

type MeliBookmarksEnvelope = {
  results?: MeliBookmark[];
  bookmarks?: MeliBookmark[];
  items?: MeliBookmark[];
  paging?: unknown;
};

type MeliItemResponse = {
  id: string;
  title: string;
  permalink?: string;
  thumbnail?: string;
  secure_thumbnail?: string;
  pictures?: Array<{ url?: string; secure_url?: string }>;
  price: number;
  original_price?: number | null;
  currency_id?: string;
  seller_id?: number | string;
  condition?: string;
  available_quantity?: number;
  status?: string;
  category_id?: string;
  seller?: { id?: number | string; nickname?: string };
  variations?: Array<{ id?: number | string; attribute_combinations?: Array<{ name?: string; value_name?: string }> }>;
  shipping?: { free_shipping?: boolean };
};

type SyncResultItem = {
  externalItemId: string;
  title: string;
  productId?: string;
  action: "created" | "updated" | "skipped" | "failed";
  reason?: string;
};

type SyncResponse = {
  syncedAt: string;
  importedCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  noLongerFavoritedCount: number;
  results: SyncResultItem[];
};

type MeliDiagnosticsCall = {
  url: string;
  authorizationSent: boolean;
  authorizationFormat: string;
  tokenPreview: {
    length: number;
    prefixMasked: string;
    suffixMasked: string;
    expiresAt: string | null;
    integrationId: string;
  };
  redirected: boolean;
  status: number;
  ok: boolean;
  body: unknown;
  requestId: string | null;
  correlationId: string | null;
};

type MeliDiagnosticsResponse = {
  integrationId: string;
  tokenType: string;
  tokenExpiresAt: string | null;
  tokenNotExpired: boolean;
  authorizationHeaderPresent: boolean;
  authorizationHeaderFormat: string;
  tokenSource: "mercado_livre_integration";
  callbackIdentity: {
    meliUserId: string | null;
    nickname: string | null;
    siteId: string | null;
    scopes: string | null;
    hasRefreshToken: boolean;
    lastRefreshedAt: string | null;
  };
  oauthExchangeSnapshot: {
    userId: string | null;
    tokenType: string;
    scope: string | null;
    expiresInApproxSeconds: number | null;
    hasRefreshToken: boolean;
  };
  currentTokenCheck: {
    clientHttp: {
      me: MeliDiagnosticsCall;
      bookmarks: MeliDiagnosticsCall;
    };
    nativeFetch: {
      me: MeliDiagnosticsCall;
      bookmarks: MeliDiagnosticsCall;
    };
  };
};

type FavoriteUpsertResult = {
  product: Awaited<ReturnType<typeof mercadoLivreRepository.findMarketplaceProduct>> extends infer T
    ? T extends null
      ? never
      : NonNullable<T>
    : never;
  action: "created" | "updated" | "skipped";
};

function requireConfigured() {
  if (!mercadoLivreConfigured()) {
    throw new AppError(
      "Integração Mercado Livre indisponível: configure MELI_CLIENT_ID, MELI_CLIENT_SECRET, MELI_REDIRECT_URI e MELI_TOKEN_ENCRYPTION_KEY no backend.",
      503,
    );
  }
}

function authorizationUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.mercadoLivre.clientId,
    redirect_uri: env.mercadoLivre.redirectUri,
    state,
  });
  return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
}

function isPolicyUnauthorized(message: string) {
  return message.includes("PA_UNAUTHORIZED_RESULT_FROM_POLICIES");
}

function isInvalidGrantError(message: string) {
  return message.includes("invalid_grant");
}

function humanizeMeliError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (isPolicyUnauthorized(message)) {
    return {
      syncStatus: "permission_required" as IntegrationSyncStatus,
      userMessage:
        "O aplicativo do Mercado Livre foi autenticado, mas ainda não tem permissão funcional para acessar favoritos (/users/me/bookmarks). Ative a permissão correspondente no DevCenter do Mercado Livre e autorize novamente a aplicação.",
    };
  }

  if (isInvalidGrantError(message)) {
    return {
      syncStatus: "reconnect_required" as IntegrationSyncStatus,
      userMessage:
        "O refresh token do Mercado Livre não é mais válido. Conecte novamente sua conta para renovar a autorização.",
    };
  }

  return {
    syncStatus: "failed" as IntegrationSyncStatus,
    userMessage: message,
  };
}

async function meliFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AppError(`Mercado Livre retornou ${response.status} em ${path}: ${body.slice(0, 300)}`, response.status);
  }

  return (await response.json()) as T;
}

async function oauthTokenRequest(body: URLSearchParams): Promise<MeliTokenResponse> {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(`Falha na troca de token do Mercado Livre: ${response.status} ${text.slice(0, 300)}`, response.status);
  }

  return (await response.json()) as MeliTokenResponse;
}

function maskToken(accessToken: string, integrationId: string, expiresAt?: Date | null) {
  const prefix = accessToken.slice(0, 4);
  const suffix = accessToken.slice(-4);
  return {
    length: accessToken.length,
    prefixMasked: `${prefix}***`,
    suffixMasked: `***${suffix}`,
    expiresAt: expiresAt?.toISOString() || null,
    integrationId,
  };
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function meliFetchDetailed(
  path: string,
  accessToken: string,
  integration: { id: string; tokenExpiresAt: Date | null },
  init?: RequestInit,
): Promise<MeliDiagnosticsCall> {
  const url = `https://api.mercadolibre.com${path}`;
  const authorizationValue = `Bearer ${accessToken}`;
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: {
      accept: "application/json",
      Authorization: authorizationValue,
      ...(init?.headers || {}),
    },
  });

  return {
    url,
    authorizationSent: true,
    authorizationFormat: authorizationValue.startsWith("Bearer ") ? "Bearer <token>" : "invalid",
    tokenPreview: maskToken(accessToken, integration.id, integration.tokenExpiresAt),
    redirected: response.redirected,
    status: response.status,
    ok: response.ok,
    body: await readResponseBody(response),
    requestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
    correlationId: response.headers.get("x-correlation-id") || response.headers.get("correlation-id"),
  };
}

function expiresAtFromNow(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

function syncLockExpired(startedAt?: Date | null) {
  if (!startedAt) return true;
  return Date.now() - startedAt.getTime() > LOCK_TTL_MS;
}

function computeDiscountPercentage(originalPrice?: number | null, currentPrice?: number | null) {
  if (
    originalPrice == null ||
    currentPrice == null ||
    !Number.isFinite(originalPrice) ||
    !Number.isFinite(currentPrice) ||
    currentPrice >= originalPrice ||
    originalPrice <= 0
  ) {
    return null;
  }
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}

function mapAvailability(item: MeliItemResponse) {
  if (item.status && item.status !== "active") return item.status;
  if ((item.available_quantity || 0) > 0) return "in_stock";
  return "unknown";
}

function normalizeFavoriteItem(item: MeliItemResponse) {
  const image =
    item.secure_thumbnail ||
    item.thumbnail ||
    item.pictures?.[0]?.secure_url ||
    item.pictures?.[0]?.url ||
    null;
  const discountPercentage = computeDiscountPercentage(item.original_price ?? null, item.price ?? null);
  const variation =
    item.variations?.[0]?.attribute_combinations
      ?.map((entry) => [entry.name, entry.value_name].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" | ") || null;

  return {
    externalItemId: item.id,
    title: item.title,
    purchaseUrl: item.permalink || `https://www.mercadolivre.com.br/p/${item.id}`,
    imageUrl: image,
    currentPrice: Number(item.price || 0),
    originalPrice:
      item.original_price != null && Number.isFinite(item.original_price)
        ? Number(item.original_price)
        : Number(item.price || 0),
    currency: item.currency_id || "BRL",
    seller: item.seller?.nickname || (item.seller_id ? String(item.seller_id) : "Mercado Livre"),
    condition: item.condition || null,
    availability: mapAvailability(item),
    categoryId: item.category_id || null,
    variation,
    discountPercentage,
    raw: item,
  };
}

async function ensureBrand(userId: string) {
  return brandRepository.findOrCreate(userId, BRAND_NAME);
}

async function getValidAccessToken(userId: string) {
  requireConfigured();
  const integration = await mercadoLivreRepository.findIntegrationByUser(userId);
  if (!integration) {
    throw new AppError("Mercado Livre não conectado", 404);
  }

  if (integration.tokenExpiresAt.getTime() > Date.now() + ACCESS_TOKEN_REFRESH_MARGIN_MS) {
    return {
      integration,
      accessToken: decryptSecret(integration.accessTokenEncrypted),
      refreshToken: decryptSecret(integration.refreshTokenEncrypted),
    };
  }

  try {
    const token = await oauthTokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.mercadoLivre.clientId,
        client_secret: env.mercadoLivre.clientSecret,
        refresh_token: decryptSecret(integration.refreshTokenEncrypted),
      }),
    );

    const updated = await mercadoLivreRepository.updateIntegration(userId, {
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      tokenType: token.token_type || "Bearer",
      scopes: token.scope || "offline_access",
      tokenExpiresAt: expiresAtFromNow(token.expires_in),
      lastRefreshedAt: new Date(),
      syncStatus: "idle",
      syncError: null,
    });

    return {
      integration: updated,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    };
  } catch (error) {
    const normalized = humanizeMeliError(error);
    await mercadoLivreRepository.updateIntegration(userId, {
      syncStatus: normalized.syncStatus,
      syncStartedAt: null,
      syncError: normalized.userMessage,
    });
    throw new AppError(normalized.userMessage, error instanceof AppError ? error.statusCode : 401);
  }
}

function parseBookmarksResponse(payload: MeliBookmark[] | MeliBookmarksEnvelope) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.bookmarks)) return payload.bookmarks;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

async function fetchBookmarkedItems(accessToken: string) {
  const bookmarksResponse = await meliFetch<MeliBookmark[] | MeliBookmarksEnvelope>("/users/me/bookmarks", accessToken);
  const bookmarks = parseBookmarksResponse(bookmarksResponse);
  const ids = bookmarks.map((bookmark) => bookmark.item_id).filter(Boolean);
  const items: MeliItemResponse[] = [];

  for (let index = 0; index < ids.length; index += 20) {
    const batch = ids.slice(index, index + 20);
    const multi = await meliFetch<Array<{ body?: MeliItemResponse; code?: number }>>(
      `/items?ids=${batch.join(",")}`,
      accessToken,
    );

    for (const result of multi) {
      if (result.code && result.code >= 400) continue;
      if (result.body?.id) items.push(result.body);
    }
  }

  return {
    bookmarks,
    items: items.map(normalizeFavoriteItem),
  };
}

async function recordPriceHistory(params: {
  productId: string;
  currentPrice: number;
  originalPrice: number;
  availability: string;
  raw: unknown;
}) {
  const previous = await mercadoLivreRepository.findLatestPriceHistory(params.productId);
  const previousPrice = previous ? Number(previous.currentPrice) : null;
  const lowest = previous
    ? Math.min(Number(previous.lowestRecordedPrice || previous.currentPrice), params.currentPrice)
    : params.currentPrice;
  const discountPercentage = computeDiscountPercentage(params.originalPrice, params.currentPrice);

  await mercadoLivreRepository.createPriceHistory({
    productId: params.productId,
    source: MARKETPLACE,
    previousPrice,
    currentPrice: params.currentPrice,
    originalPrice: params.originalPrice,
    lowestRecordedPrice: lowest,
    discountPercentage,
    availability: params.availability,
    details: params.raw as Prisma.InputJsonValue,
  });

  return { previousPrice, lowestPrice: lowest, discountPercentage };
}

async function maybeNotify(params: {
  userId: string;
  productId: string;
  title: string;
  imageUrl: string | null;
  purchaseUrl: string;
  previousPrice: number | null;
  currentPrice: number;
  originalPrice: number;
  lowestPrice: number;
  discountPercentage: number | null;
  availability: string;
  targetPrice?: number | null;
}) {
  const basePayload = {
    imageUrl: params.imageUrl,
    purchaseUrl: params.purchaseUrl,
    previousPrice: params.previousPrice,
    currentPrice: params.currentPrice,
    originalPrice: params.originalPrice,
    lowestPrice: params.lowestPrice,
    discountPercentage: params.discountPercentage,
    availability: params.availability,
  };

  const candidates: Array<{ type: string; dedupeKey: string; title: string; body: string }> = [];

  if (params.discountPercentage != null && params.discountPercentage > 0) {
    candidates.push({
      type: "promotion_detected",
      dedupeKey: `meli:${params.productId}:promo:${params.currentPrice}:${params.originalPrice}`,
      title: `${params.title} entrou em promoção`,
      body: `De ${params.originalPrice} para ${params.currentPrice}`,
    });
  }

  if (params.previousPrice != null && params.currentPrice < params.previousPrice) {
    candidates.push({
      type: "price_drop",
      dedupeKey: `meli:${params.productId}:drop:${params.previousPrice}:${params.currentPrice}`,
      title: `${params.title} baixou de preço`,
      body: `De ${params.previousPrice} para ${params.currentPrice}`,
    });
  }

  if (params.targetPrice != null && params.currentPrice <= params.targetPrice) {
    candidates.push({
      type: "target_price_reached",
      dedupeKey: `meli:${params.productId}:target:${params.targetPrice}:${params.currentPrice}`,
      title: `${params.title} atingiu seu preço-alvo`,
      body: `Preço atual ${params.currentPrice}`,
    });
  }

  if (params.previousPrice != null && params.currentPrice <= params.lowestPrice) {
    candidates.push({
      type: "new_lowest_price",
      dedupeKey: `meli:${params.productId}:lowest:${params.currentPrice}`,
      title: `${params.title} atingiu o menor preço histórico`,
      body: `Novo menor preço: ${params.currentPrice}`,
    });
  }

  if (params.availability === "in_stock") {
    candidates.push({
      type: "back_in_stock",
      dedupeKey: `meli:${params.productId}:stock:${params.availability}:${params.currentPrice}`,
      title: `${params.title} voltou ao estoque`,
      body: `Disponível novamente por ${params.currentPrice}`,
    });
  }

  for (const candidate of candidates) {
    const existing = await mercadoLivreRepository.findNotificationByDedupeKey(candidate.dedupeKey);
    if (existing) continue;
    await mercadoLivreRepository.createNotification({
      userId: params.userId,
      productId: params.productId,
      type: candidate.type,
      dedupeKey: candidate.dedupeKey,
      title: candidate.title,
      body: candidate.body,
      payload: basePayload,
    });
  }
}

async function upsertFavoriteProduct(userId: string, favorite: ReturnType<typeof normalizeFavoriteItem>): Promise<FavoriteUpsertResult> {
  const brand = await ensureBrand(userId);
  const existing = await mercadoLivreRepository.findMarketplaceProduct(
    userId,
    MARKETPLACE,
    favorite.externalItemId,
  );

  const externalData = {
    marketplace: MARKETPLACE,
    meliCategoryId: favorite.categoryId,
    currency: favorite.currency,
    seller: favorite.seller,
    condition: favorite.condition,
    variation: favorite.variation,
    raw: favorite.raw,
  } as Prisma.InputJsonValue;

  let product;
  let action: FavoriteUpsertResult["action"] = "updated";

  if (!existing) {
    product = await prisma.product.create({
      data: {
        userId,
        brandId: brand.id,
        name: favorite.title,
        category: DEFAULT_CATEGORY,
        store: BRAND_NAME,
        originalPrice: favorite.originalPrice,
        promotionalPrice:
          favorite.originalPrice > favorite.currentPrice ? favorite.currentPrice : null,
        purchaseUrl: favorite.purchaseUrl,
        imageUrl: favorite.imageUrl,
        color: null,
        size: null,
        priority: "Quero",
        status: "Quero comprar",
        notes: null,
        marketplace: MARKETPLACE,
        externalItemId: favorite.externalItemId,
        externalData,
        noLongerFavorited: false,
        importedAt: new Date(),
        lastMarketplaceSyncAt: new Date(),
        availability: favorite.availability,
      },
      include: { brand: true, images: true },
    });
    action = "created";
  } else {
    product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: favorite.title,
        purchaseUrl: favorite.purchaseUrl,
        imageUrl: favorite.imageUrl,
        originalPrice: favorite.originalPrice,
        promotionalPrice:
          favorite.originalPrice > favorite.currentPrice ? favorite.currentPrice : null,
        availability: favorite.availability,
        externalData,
        noLongerFavorited: false,
        lastMarketplaceSyncAt: new Date(),
      },
      include: { brand: true, images: true },
    });
  }

  const history = await recordPriceHistory({
    productId: product.id,
    currentPrice: favorite.currentPrice,
    originalPrice: favorite.originalPrice,
    availability: favorite.availability,
    raw: favorite.raw,
  });

  await maybeNotify({
    userId,
    productId: product.id,
    title: favorite.title,
    imageUrl: favorite.imageUrl,
    purchaseUrl: favorite.purchaseUrl,
    previousPrice: history.previousPrice,
    currentPrice: favorite.currentPrice,
    originalPrice: favorite.originalPrice,
    lowestPrice: history.lowestPrice,
    discountPercentage: history.discountPercentage,
    availability: favorite.availability,
    targetPrice: product.targetPrice != null ? Number(product.targetPrice) : null,
  });

  const sameAsPrevious =
    action === "updated" &&
    history.previousPrice != null &&
    history.previousPrice === favorite.currentPrice &&
    Number(existing?.originalPrice || 0) === favorite.originalPrice;

  return {
    product,
    action: sameAsPrevious ? "skipped" : action,
  };
}

export const mercadoLivreService = {
  getPublicConfig() {
    return {
      available: mercadoLivreConfigured(),
      productionFrontendUrl: "https://purchase-planner.vercel.app",
      productionBackendUrl: "https://closet-sonhos-api.onrender.com",
      productionRedirectUri: "https://closet-sonhos-api.onrender.com/api/integrations/mercadolivre/callback",
      localRedirectUri: "http://localhost:3333/api/integrations/mercadolivre/callback",
      requiredEnvVars: [
        "MELI_CLIENT_ID",
        "MELI_CLIENT_SECRET",
        "MELI_REDIRECT_URI",
        "MELI_TOKEN_ENCRYPTION_KEY",
      ],
      autoSyncIntervalMinutes: AUTO_SYNC_INTERVAL_MS / 60000,
    };
  },

  async getStatus(userId: string) {
    const integration = await mercadoLivreRepository.findIntegrationByUser(userId);
    const nextAutoSyncAt =
      integration?.lastSyncedAt
        ? new Date(integration.lastSyncedAt.getTime() + AUTO_SYNC_INTERVAL_MS).toISOString()
        : null;
    return {
      available: mercadoLivreConfigured(),
      connected: Boolean(integration),
      lastSyncedAt: integration?.lastSyncedAt?.toISOString() || null,
      tokenExpiresAt: integration?.tokenExpiresAt?.toISOString() || null,
      lastRefreshedAt: integration?.lastRefreshedAt?.toISOString() || null,
      nextAutoSyncAt,
      nickname: integration?.nickname || null,
      meliUserId: integration?.meliUserId || null,
      syncStatus: integration?.syncStatus || "idle",
      syncError: integration?.syncError || null,
    };
  },

  async createConnectUrl(userId: string, redirectTo?: string | null) {
    requireConfigured();
    await mercadoLivreRepository.cleanupExpiredStates();
    const state = randomState(24);
    await mercadoLivreRepository.createOAuthState(
      userId,
      state,
      new Date(Date.now() + STATE_TTL_MS),
      redirectTo,
    );
    return {
      authorizationUrl: authorizationUrl(state),
      state,
    };
  },

  async handleCallback(code: string, state: string) {
    requireConfigured();
    const stateRecord = await mercadoLivreRepository.consumeOAuthState(state);
    if (!stateRecord) {
      throw new AppError("State OAuth invalido, expirado ou ja utilizado", 400);
    }

    const token = await oauthTokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.mercadoLivre.clientId,
        client_secret: env.mercadoLivre.clientSecret,
        code,
        redirect_uri: env.mercadoLivre.redirectUri,
      }),
    );

    const user = await meliFetch<MeliUserResponse>("/users/me", token.access_token);
    await mercadoLivreRepository.upsertIntegration(stateRecord.userId, {
      meliUserId: String(user.user_id || user.id),
      nickname: user.nickname || null,
      siteId: user.site_id || null,
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      tokenType: token.token_type || "Bearer",
      scopes: token.scope || "offline_access",
      tokenExpiresAt: expiresAtFromNow(token.expires_in),
      lastRefreshedAt: new Date(),
      syncStatus: "idle",
      syncError: null,
    });

    return {
      userId: stateRecord.userId,
      redirectTo: stateRecord.redirectTo || "/?tab=achadinhos&meli=connected",
      nickname: user.nickname || null,
      meliUserId: String(user.user_id || user.id),
    };
  },

  async syncFavorites(userId: string): Promise<SyncResponse> {
    const { integration, accessToken } = await getValidAccessToken(userId);
    if (integration.syncStatus === "running" && !syncLockExpired(integration.syncStartedAt)) {
      throw new AppError("Já existe uma sincronização do Mercado Livre em andamento", 409);
    }

    await mercadoLivreRepository.updateIntegration(userId, {
      syncStatus: "running",
      syncStartedAt: new Date(),
      syncError: null,
    });

    try {
      const { items } = await fetchBookmarkedItems(accessToken);
      const results: SyncResultItem[] = [];
      const seen = new Set<string>();
      let importedCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let failedCount = 0;

      for (const favorite of items) {
        seen.add(favorite.externalItemId);
        try {
          const result = await upsertFavoriteProduct(userId, favorite);
          if (result.action === "created") importedCount += 1;
          else if (result.action === "updated") updatedCount += 1;
          else unchangedCount += 1;

          results.push({
            externalItemId: favorite.externalItemId,
            title: favorite.title,
            productId: result.product.id,
            action: result.action as SyncResultItem["action"],
          });
        } catch (error) {
          failedCount += 1;
          results.push({
            externalItemId: favorite.externalItemId,
            title: favorite.title,
            action: "failed",
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const stale = await prisma.product.findMany({
        where: {
          userId,
          marketplace: MARKETPLACE,
          externalItemId: { not: null },
          NOT: {
            externalItemId: { in: [...seen] },
          },
        },
        select: { id: true },
      });

      if (stale.length) {
        await prisma.product.updateMany({
          where: { id: { in: stale.map((item) => item.id) } },
          data: {
            noLongerFavorited: true,
            lastMarketplaceSyncAt: new Date(),
          },
        });
      }

      await mercadoLivreRepository.updateIntegration(userId, {
        syncStatus: "idle",
        syncStartedAt: null,
        syncError: null,
        lastSyncedAt: new Date(),
      });

      return {
        syncedAt: new Date().toISOString(),
        importedCount,
        updatedCount,
        unchangedCount,
        failedCount,
        noLongerFavoritedCount: stale.length,
        results,
      };
    } catch (error) {
      const normalized = humanizeMeliError(error);
      await mercadoLivreRepository.updateIntegration(userId, {
        syncStatus: normalized.syncStatus,
        syncStartedAt: null,
        syncError: normalized.userMessage,
      });
      throw new AppError(
        normalized.userMessage,
        error instanceof AppError ? error.statusCode : 500,
      );
    }
  },

  async disconnect(userId: string) {
    await mercadoLivreRepository.deleteIntegration(userId);
    return { disconnected: true };
  },

  async runDiagnostics(userId: string): Promise<MeliDiagnosticsResponse> {
    const { integration, accessToken } = await getValidAccessToken(userId);
    const tokenExpiresAt = integration.tokenExpiresAt?.toISOString() || null;
    const baseSnapshot = {
      integrationId: integration.id,
      tokenType: integration.tokenType,
      tokenExpiresAt,
      tokenNotExpired: Boolean(integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() > Date.now()),
      authorizationHeaderPresent: Boolean(accessToken),
      authorizationHeaderFormat: accessToken ? "Bearer <token>" : "missing",
      tokenSource: "mercado_livre_integration" as const,
      callbackIdentity: {
        meliUserId: integration.meliUserId,
        nickname: integration.nickname,
        siteId: integration.siteId,
        scopes: integration.scopes || null,
        hasRefreshToken: Boolean(integration.refreshTokenEncrypted),
        lastRefreshedAt: integration.lastRefreshedAt?.toISOString() || null,
      },
      oauthExchangeSnapshot: {
        userId: integration.meliUserId,
        tokenType: integration.tokenType,
        scope: integration.scopes || null,
        expiresInApproxSeconds: integration.tokenExpiresAt
          ? Math.max(0, Math.round((integration.tokenExpiresAt.getTime() - Date.now()) / 1000))
          : null,
        hasRefreshToken: Boolean(integration.refreshTokenEncrypted),
      },
    };

    const clientMe = await meliFetchDetailed("/users/me", accessToken, integration);
    const clientBookmarks = await meliFetchDetailed("/users/me/bookmarks", accessToken, integration);
    const nativeMe = await meliFetchDetailed("/users/me", accessToken, integration, {
      method: "GET",
      cache: "no-store",
    });
    const nativeBookmarks = await meliFetchDetailed("/users/me/bookmarks", accessToken, integration, {
      method: "GET",
      cache: "no-store",
    });

    return {
      ...baseSnapshot,
      currentTokenCheck: {
        clientHttp: {
          me: clientMe,
          bookmarks: clientBookmarks,
        },
        nativeFetch: {
          me: nativeMe,
          bookmarks: nativeBookmarks,
        },
      },
    };
  },

  async runAutoSyncCycle() {
    if (!mercadoLivreConfigured()) return;
    const integrations = await mercadoLivreRepository.listAutoSyncIntegrations();
    for (const integration of integrations) {
      try {
        await this.syncFavorites(integration.userId);
      } catch (error) {
        console.error("[meli.autoSync] falha", {
          userId: integration.userId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },

  autoSyncIntervalMs: AUTO_SYNC_INTERVAL_MS,
};
