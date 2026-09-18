export type ShopperFailureKind = "quota" | "timeout" | "unavailable" | "error";

export class ShopperProviderError extends Error {
  kind: ShopperFailureKind;
  technical: string;
  constructor(kind: ShopperFailureKind, technical: string) {
    super(technical);
    this.kind = kind;
    this.technical = technical;
  }
}

export const shopperUnavailableUserMessage = "Não foi possível buscar novas ofertas agora. Tente novamente mais tarde.";
export const shopperRefreshUnavailableUserMessage = "Não foi possível atualizar os preços agora. Os valores conhecidos continuam visíveis.";

export function classifyShopperProviderFailure(error: unknown): { kind: ShopperFailureKind; technical: string } {
  if (error instanceof ShopperProviderError) return { kind: error.kind, technical: error.technical };
  const status = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : NaN;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  const technical = message.slice(0, 240);
  if (name === "TimeoutError" || name === "AbortError" || /timeout|timed out|aborted/i.test(message)) return { kind: "timeout", technical };
  if (status === 429 || /(?:^|\b)(429|rate limit|too many requests|run out of search|out of searches|quota)(?:\b|$)/i.test(message)) return { kind: "quota", technical };
  if (status >= 500 || name === "TypeError" || /http\s*5\d\d|unavailable|service down|econnrefused|enotfound|fetch failed/i.test(message)) return { kind: "unavailable", technical };
  return { kind: "error", technical };
}

export function shopperProviderErrorFromUnknown(error: unknown) {
  const classified = classifyShopperProviderFailure(error);
  return error instanceof ShopperProviderError ? error : new ShopperProviderError(classified.kind, classified.technical);
}

export function logShopperProviderFailure(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  const classified = classifyShopperProviderFailure(error);
  console.info("[shopper.provider]", { scope, kind: classified.kind, technical: classified.technical, ...extra });
  return classified;
}
