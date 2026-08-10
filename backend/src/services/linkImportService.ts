import dns from "node:dns/promises";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";
import { SerpApiProductSearchProvider } from "./serpApiProductSearchProvider.js";

export type FindingMediaInput = { type: "image" | "video"; url: string };

export type LinkPreview = {
  title: string;
  brand: string;
  store: string;
  description: string;
  price: number | null;
  previousPrice: number | null;
  shippingPrice: number | null;
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
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
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

async function fetchReaderFallback(url: string) {
  const source = new URL(url);
  if (source.hostname !== "useelizah.com.br" && source.hostname !== "www.useelizah.com.br") {
    throw new AppError("A leitura alternativa nao esta disponivel para esta loja.", 422);
  }
  const response = await fetch(`https://r.jina.ai/http://${source.host}${source.pathname}${source.search}`, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "text/plain" },
  });
  if (!response.ok) throw new AppError("Nao foi possivel ler a pagina bloqueada.", 422);
  return response.text();
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

function shippingFromText(value: unknown) {
  if (typeof value !== "string") return null;
  if (/frete\s+gr[aá]tis|entrega\s+gr[aá]tis/i.test(value)) return 0;
  const match = value.match(/(?:frete|entrega|shipping)[^R$]{0,60}R\$\s*([\d.,]+)/i);
  return match ? numberOrNull(match[1]) : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function validateMedia(item: FindingMediaInput): Promise<FindingMediaInput | null> {
  let url = item.url;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    try {
      await assertPublicUrl(url);
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
          accept: item.type === "image" ? "image/avif,image/webp,image/*,*/*;q=0.7" : "video/*,*/*;q=0.7",
          range: "bytes=0-1024",
        },
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        await response.body?.cancel();
        url = new URL(response.headers.get("location")!, url).toString();
        continue;
      }
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      await response.body?.cancel();
      const expectedType = item.type === "image" ? "image/" : "video/";
      return response.ok && contentType.startsWith(expectedType) ? { ...item, url } : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function keepUsableMedia(items: FindingMediaInput[]) {
  const candidates = dedupeMedia(items).slice(0, 16);
  const checked = await Promise.all(candidates.map(validateMedia));
  return checked.filter((item): item is FindingMediaInput => Boolean(item));
}

function selectProductImages(candidates: string[], allowUnscoped = false) {
  const grouped = new Map<string, string[]>();
  for (const url of candidates) {
    const productId = url.match(/\/produtos\/([^/]+)\//i)?.[1];
    if (!productId) continue;
    grouped.set(productId, [...(grouped.get(productId) || []), url]);
  }
  const group = [...grouped.values()].sort((a, b) => b.length - a.length)[0];
  const source = group?.length ? group : allowUnscoped ? candidates : [];
  const byPhoto = new Map<string, string>();
  for (const url of source) {
    const key = url.replace(/_mini(?=\.[a-z]{2,5}(?:\?|$))/i, "");
    const current = byPhoto.get(key);
    if (!current || (/_mini(?=\.[a-z]{2,5}(?:\?|$))/i.test(current) && !/_mini(?=\.[a-z]{2,5}(?:\?|$))/i.test(url))) {
      byPhoto.set(key, url);
    }
  }
  return [...byPhoto.values()].slice(0, 24);
}

export function extractProductFromHtml(html: string, finalUrl: string): Omit<LinkPreview, "originalUrl" | "normalizedUrl"> {
  const base = new URL(finalUrl);
  // Product pages commonly render recommendations below the product.  Never let
  // their images or prices leak into the preview gallery.
  const productPageHtml = html.match(/<section\b[^>]*\bid=["']produto["'][^>]*>[\s\S]*?(?=<section\b[^>]*\bid=["']prod-relacionados["']|$)/i)?.[0] || html;
  const json = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => { try { return flattenJsonLd(JSON.parse(match[1])); } catch { return []; } });
  const product = json.find((item) => {
    const type = item["@type"];
    return type === "Product" || (Array.isArray(type) && type.includes("Product"));
  }) || {};
  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
  const offer = typeof offers === "object" && offers ? offers as Record<string, unknown> : {};
  const productImageUrls = strings(product.image).concat(strings(product.associatedMedia));
  const readerTitle = html.match(/^Title:\s*(.+)$/mi)?.[1] || "";
  const htmlImageUrls = [...productPageHtml.matchAll(/<img\b[^>]+(?:src|data-src|data-original|data-zoom-image)=["']([^"']+)["']/gi)].map((m) => m[1]);
  const readerGallery = readerTitle
    ? html.split(/PRODUTOS RELACIONADOS/i)[0]
    : "";
  const readerImageUrls = [...readerGallery.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)[^)]*\)/gi)].map((m) => m[1]);
  const ogImages = [meta(html, "og:image"), meta(html, "twitter:image")];
  const videoUrls = [
    ...strings(product.video),
    ...[...productPageHtml.matchAll(/<(?:video|source)\b[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]),
  ];
  const structuredImages = productImageUrls
    .map((url) => absoluteUrl(url, base)).filter((url): url is string => Boolean(url));
  const pageImages = (readerTitle ? readerImageUrls : htmlImageUrls)
    .map((url) => absoluteUrl(url, base)).filter((url): url is string => Boolean(url));
  const images = structuredImages.length
    ? selectProductImages(structuredImages, true)
    : selectProductImages(pageImages);
  const fallbackImages = ogImages
    .map((url) => absoluteUrl(url, base)).filter((url): url is string => Boolean(url));
  const selectedImages = images.length ? images : selectProductImages(fallbackImages, true).slice(0, 1);
  const videos = videoUrls.map((url) => absoluteUrl(url, base)).filter((url): url is string => Boolean(url)).slice(0, 12);
  const brand = typeof product.brand === "object" && product.brand ? String((product.brand as Record<string, unknown>).name || "") : String(product.brand || "");
  const availabilityRaw = String(offer.availability || meta(html, "product:availability") || "").toLowerCase();
  const ogTitle = meta(html, "og:title");
  const titleSource = String(product.name || ogTitle || readerTitle || "");
  const title = titleSource.replace(/^comprar\s+/i, "").replace(/\s*[-|–]\s*R\$\s*[\d.,]+.*$/i, "").trim();
  const priceFromTitle = titleSource.match(/R\$\s*([\d.,]+)/i)?.[1];
  const readerProductSection = readerTitle && title
    ? html.match(new RegExp(`###\\s+${escapeRegex(title)}[\\s\\S]{0,5000}`, "i"))?.[0] || ""
    : "";
  const readerMainPrice = readerProductSection.match(/R\$\s*([\d.,]+)/i)?.[1];
  const pageItempropPrice = productPageHtml.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || productPageHtml.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i)?.[1];
  const pricePair = productPageHtml.match(/de\s*R\$\s*([\d.,]+)\s*por\s*(?:\n|\s)*R\$\s*([\d.,]+)/i);
  return {
    title,
    brand,
    store: base.hostname.replace(/^www\./, ""),
    description: String(product.description || meta(html, "og:description") || meta(html, "description") || ""),
    price: numberOrNull(offer.price || meta(html, "product:price:amount") || pageItempropPrice || readerMainPrice || pricePair?.[2] || priceFromTitle),
    previousPrice: numberOrNull(offer.highPrice || offer.priceBefore || offer.compareAtPrice),
    shippingPrice: shippingFromText(productPageHtml) ?? shippingFromText(html),
    currency: String(offer.priceCurrency || meta(html, "product:price:currency") || "BRL"),
    category: String(product.category || ""),
    availability: availabilityRaw.includes("instock") || availabilityRaw.includes("in_stock") ? "in_stock" : availabilityRaw.includes("outofstock") ? "out_of_stock" : "unknown",
    media: dedupeMedia([...selectedImages.map((url) => ({ type: "image" as const, url })), ...videos.map((url) => ({ type: "video" as const, url }))]),
  };
}

function previewLooksIncomplete(preview: Omit<LinkPreview, "originalUrl" | "normalizedUrl">) {
  return !preview.title || /^www\./i.test(preview.title) || preview.price == null || !preview.media.length;
}

function previewQuery(url: string, title: string) {
  if (title && !/^www\./i.test(title)) return title;
  return decodeURIComponent(new URL(url).pathname).replace(/[\/_-]+/g, " ").replace(/\s+/g, " ").trim();
}

async function shoppingFallback(url: string, title: string) {
  const provider = new SerpApiProductSearchProvider();
  if (!provider.available()) return null;
  const host = new URL(url).hostname.replace(/^www\./, "");
  const results = await provider.search({ query: previewQuery(url, title), category: null, maxPrice: null, maxPriceIsHard: false, currency: "BRL", colors: [], size: null, brands: [], usage: null, style: [], exclude: [], originalOnly: false, sortPreference: "best_match" });
  return results.find((item) => {
    try { return new URL(item.productUrl).hostname.replace(/^www\./, "") === host; } catch { return false; }
  }) || results.find((item) => item.store?.toLowerCase().replace(/[^a-z0-9]/g, "").includes(host.split(".")[0])) || null;
}

async function aiFallback(html: string, url: string) {
  if (!env.shopperAi.apiKey || html.length < 600) return null;
  try {
    const response = await fetch(env.shopperAi.apiUrl, {
      method: "POST",
      signal: AbortSignal.timeout(18_000),
      headers: { authorization: `Bearer ${env.shopperAi.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.shopperAi.model,
        input: [{ role: "system", content: "Extraia somente dados comprovados do HTML de uma pagina de produto. Nunca invente valores ou URLs. Retorne JSON puro com title, brand, price, previousPrice, shippingPrice, description e media (lista de {type:'image'|'video',url})." }, { role: "user", content: JSON.stringify({ url, html: html.slice(0, 70_000) }) }],
        text: { format: { type: "json_object" } },
      }),
    });
    if (!response.ok) return null;
    const body = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const raw = body.output_text || body.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("");
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const media = Array.isArray(data.media) ? data.media.flatMap((item): FindingMediaInput[] => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      const mediaUrl = typeof candidate.url === "string" ? absoluteUrl(candidate.url, new URL(url)) : null;
      return mediaUrl && (candidate.type === "image" || candidate.type === "video") ? [{ type: candidate.type, url: mediaUrl }] : [];
    }) : [];
    return { title: typeof data.title === "string" ? data.title.trim() : "", brand: typeof data.brand === "string" ? data.brand.trim() : "", description: typeof data.description === "string" ? data.description.trim() : "", price: numberOrNull(data.price), previousPrice: numberOrNull(data.previousPrice), shippingPrice: numberOrNull(data.shippingPrice), media: dedupeMedia(media) };
  } catch {
    return null;
  }
}

export const linkImportService = {
  async preview(raw: string): Promise<LinkPreview> {
    const normalizedUrl = normalizeFindingUrl(raw);
    const { response, finalUrl } = await fetchPublicPage(normalizedUrl);
    const originalUrl = normalizeFindingUrl(response.url || finalUrl);
    const isBotCheck = new URL(originalUrl).pathname.includes("anti-bot-check");
    const isElizah = new URL(normalizedUrl).hostname.replace(/^www\./, "") === "useelizah.com.br";
    const initialContent = await response.text();
    const isBotContent = /anti-bot-check|checking your browser|verificando seu navegador/i.test(initialContent);
    let content = initialContent;
    if ((isBotCheck || isBotContent) && isElizah) {
      try { content = await fetchReaderFallback(normalizedUrl); } catch { /* Google Shopping/AI fallback below can still recover the preview. */ }
    }
    const productUrl = isBotCheck ? normalizedUrl : originalUrl;
    const parsed = extractProductFromHtml(content, productUrl);
    const shopping = previewLooksIncomplete(parsed) ? await shoppingFallback(productUrl, parsed.title) : null;
    const ai = previewLooksIncomplete(parsed) && !shopping ? await aiFallback(content, productUrl) : null;
    const rawMedia = dedupeMedia([...(parsed.media || []), ...(shopping?.imageUrl ? [{ type: "image" as const, url: shopping.imageUrl }] : []), ...(ai?.media || [])]);
    // Never send an anti-bot page, HTML document, or broken asset as the
    // product photo. The first media item is later used for the Product card.
    const media = await keepUsableMedia(rawMedia);
    return {
      ...parsed,
      title: parsed.title && !/^www\./i.test(parsed.title) ? parsed.title : shopping?.title || ai?.title || "",
      brand: parsed.brand || shopping?.brand || ai?.brand || "",
      description: parsed.description || ai?.description || "",
      price: parsed.price ?? shopping?.price ?? ai?.price ?? null,
      previousPrice: parsed.previousPrice ?? shopping?.previousPrice ?? ai?.previousPrice ?? null,
      shippingPrice: parsed.shippingPrice ?? shippingFromText(shopping?.shipping || "") ?? ai?.shippingPrice ?? null,
      store: parsed.store || shopping?.store || new URL(productUrl).hostname.replace(/^www\./, ""),
      media,
      originalUrl: productUrl,
      normalizedUrl: productUrl,
    };
  },
};
