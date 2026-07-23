import dns from "node:dns/promises";
import { AppError } from "../middlewares/errorHandler.js";

export type FindingMediaInput = { type: "image" | "video"; url: string };

export type LinkPreview = {
  title: string;
  brand: string;
  store: string;
  description: string;
  price: number | null;
  previousPrice: number | null;
  currency: string;
  category: string;
  originalUrl: string;
  normalizedUrl: string;
  availability: string;
  media: FindingMediaInput[];
};

function isPrivateAddress(address: string) {
  const ip = address.toLowerCase();
  return (
    ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:") ||
    ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("0.") || ip.startsWith("169.254.") ||
    ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

function absoluteUrl(raw: string, base: URL) {
  try {
    const url = new URL(raw.trim(), base);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function decode(value: string) {
  return value.replace(/&quot;/gi, '"').replace(/&#x27;|&#39;/gi, "'").replace(/&amp;/gi, "&").trim();
}

export function normalizeFindingUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError("Informe uma URL valida.", 400);
  }
  if (!/^https?:$/.test(url.protocol)) throw new AppError("Use um link HTTP ou HTTPS.", 400);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|dclid|msclkid|ref|ref_|affiliate|aff_|partner)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  return url.toString();
}

async function assertPublicUrl(raw: string) {
  const url = new URL(raw);
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new AppError("Este endereco nao e permitido.", 400);
  }
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new AppError("Este endereco nao e permitido.", 400);
  }
}

async function fetchPublicPage(initialUrl: string) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; PurchasePlanner/1.0)" },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = normalizeFindingUrl(new URL(response.headers.get("location")!, url).toString());
      continue;
    }
    if (!response.ok) throw new AppError(`Nao foi possivel acessar o link (${response.status}).`, 422);
    return { response, finalUrl: url };
  }
  throw new AppError("Muitos redirecionamentos ao acessar o link.", 422);
}

function meta(html: string, name: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const property = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
    if (property?.toLowerCase() !== name.toLowerCase()) continue;
    const value = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (value) return decode(value);
  }
  return "";
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...flattenJsonLd(record["@graph"])];
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return strings(object.url || object.contentUrl || object.thumbnailUrl);
  }
  return [];
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    if (!normalized) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function dedupeMedia(items: FindingMediaInput[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractProductFromHtml(html: string, finalUrl: string): Omit<LinkPreview, "originalUrl" | "normalizedUrl"> {
  const base = new URL(finalUrl);
  const json = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => { try { return flattenJsonLd(JSON.parse(match[1])); } catch { return []; } });
  const product = json.find((item) => {
    const type = item["@type"];
    return type === "Product" || (Array.isArray(type) && type.includes("Product"));
  }) || {};
  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
  const offer = typeof offers === "object" && offers ? offers as Record<string, unknown> : {};
  const productImageUrls = strings(product.image).concat(strings(product.associatedMedia));
  const htmlImageUrls = [...html.matchAll(/<img\b[^>]+(?:src|data-src|data-original|data-zoom-image)=["']([^"']+)["']/gi)].map((m) => m[1]);
  const ogImages = [meta(html, "og:image"), meta(html, "twitter:image")];
  const videoUrls = [
    ...strings(product.video),
    ...[...html.matchAll(/<(?:video|source)\b[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]),
  ];
  const images = productImageUrls.concat(ogImages, htmlImageUrls)
    .map((url) => absoluteUrl(url, base)).filter((url): url is string => Boolean(url)).slice(0, 40);
  const videos = videoUrls.map((url) => absoluteUrl(url, base)).filter((url): url is string => Boolean(url)).slice(0, 12);
  const brand = typeof product.brand === "object" && product.brand ? String((product.brand as Record<string, unknown>).name || "") : String(product.brand || "");
  const availabilityRaw = String(offer.availability || meta(html, "product:availability") || "").toLowerCase();
  return {
    title: String(product.name || meta(html, "og:title") || ""),
    brand,
    store: base.hostname.replace(/^www\./, ""),
    description: String(product.description || meta(html, "og:description") || meta(html, "description") || ""),
    price: numberOrNull(offer.price || meta(html, "product:price:amount")),
    previousPrice: numberOrNull(offer.highPrice || offer.priceBefore || offer.compareAtPrice),
    currency: String(offer.priceCurrency || meta(html, "product:price:currency") || "BRL"),
    category: String(product.category || ""),
    availability: availabilityRaw.includes("instock") || availabilityRaw.includes("in_stock") ? "in_stock" : availabilityRaw.includes("outofstock") ? "out_of_stock" : "unknown",
    media: dedupeMedia([...images.map((url) => ({ type: "image" as const, url })), ...videos.map((url) => ({ type: "video" as const, url }))]),
  };
}

export const linkImportService = {
  async preview(raw: string): Promise<LinkPreview> {
    const normalizedUrl = normalizeFindingUrl(raw);
    const { response, finalUrl } = await fetchPublicPage(normalizedUrl);
    const originalUrl = normalizeFindingUrl(response.url || finalUrl);
    const parsed = extractProductFromHtml(await response.text(), originalUrl);
    return { ...parsed, originalUrl, normalizedUrl: originalUrl };
  },
};
