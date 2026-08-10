import dns from "node:dns/promises";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";
import { requestedSizeAvailability } from "./promoRadarService.js";
import { quoteLowestShipping } from "./shippingQuoteService.js";

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
  debug?: LinkImportDebug;
};

export type LinkImportDebug = {
  traceId: string;
  receivedUrl: string;
  externalStatus: number | null;
  finalUrl: string;
  htmlLength: number;
  jsonLdFound: boolean;
  openGraphFound: boolean;
  embeddedProductFound: boolean;
  strategies: string[];
  extractorUsed: string;
  aiFallbackUsed: boolean;
  errors: string[];
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

function htmlRedirectTarget(html: string, baseUrl: string) {
  const metaRefresh = html.match(/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*?url=([^"';\s>]+)[^"']*["']/i)?.[1];
  const scriptRedirect = html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']|(?:window\.)?location\.(?:replace|assign)\(\s*["']([^"']+)["']\s*\)/i);
  const isRedirectPage = /continuando\s+para\s+a?\s*loja|redirecionando|redirecting/i.test(html);
  const primaryLink = isRedirectPage ? html.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1] : null;
  const target = metaRefresh || scriptRedirect?.[1] || scriptRedirect?.[2] || primaryLink;
  return target ? absoluteUrl(decode(target), new URL(baseUrl)) : null;
}

async function fetchReaderFallback(url: string) {
  const source = new URL(url);
  await assertPublicUrl(source.toString());
  const response = await fetch(`https://r.jina.ai/http://${source.host}${source.pathname}${source.search}`, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "text/plain" },
  });
  if (!response.ok) throw new AppError("Nao foi possivel ler a pagina bloqueada.", 422);
  return response.text();
}

function previewScore(preview: Omit<LinkPreview, "originalUrl" | "normalizedUrl">) {
  const landingTitle = /continuando\s+para\s+a?\s*loja|redirecionando|redirecting|checking your browser|anti.bot|can.t be found|not found/i.test(preview.title);
  return (preview.title && !/^www\./i.test(preview.title) && !landingTitle ? 4 : 0)
    + (preview.price != null ? 3 : 0)
    + Math.min(preview.media.length, 4)
    + (preview.description ? 1 : 0);
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

function embeddedProductRecords(html: string) {
  const records: Record<string, unknown>[] = [];
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1].trim());
  const balancedObject = (source: string, start: number) => {
    let depth = 0; let quote = ""; let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quote) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "{") depth += 1;
      if (char === "}" && --depth === 0) return source.slice(start, index + 1);
    }
    return null;
  };
  for (const script of scripts) {
    if (script.length > 1_000_000) continue;
    const values: unknown[] = [];
    try {
      if (/^[{[]/.test(script)) values.push(JSON.parse(script));
      // Many storefronts expose the current product as a JavaScript assignment
      // rather than a JSON script tag. Read only explicitly named product/PDP
      // objects, never product lists or recommendation arrays.
      for (const match of script.matchAll(/\b(?:product(?:json|data)?|pdp|item)\s*[:=]\s*(\{)/gi)) {
        const object = balancedObject(script, match.index! + match[0].lastIndexOf("{"));
        if (object) values.push(JSON.parse(object));
      }
      const seen = new WeakSet<object>();
      const visit = (value: unknown, key = "", depth = 0): void => {
        if (depth > 12 || !value || typeof value !== "object") return;
        if (seen.has(value)) return;
        seen.add(value);
        if (!Array.isArray(value) && /^(product|productjson|pdp|productdata|item)$/i.test(key)) records.push(value as Record<string, unknown>);
        if (Array.isArray(value)) { value.slice(0, 80).forEach((child) => visit(child, key, depth + 1)); return; }
        Object.entries(value as Record<string, unknown>).slice(0, 200).forEach(([childKey, child]) => visit(child, childKey, depth + 1));
      };
      values.forEach((value) => visit(value, "product"));
    } catch { /* Non-JSON executable scripts are intentionally ignored. */ }
  }
  return records;
}

function productScore(item: Record<string, unknown>) {
  const offers = item.offers || item.offer;
  return (typeof item.name === "string" || typeof item.title === "string" ? 4 : 0)
    + (item.image || item.images || item.gallery || item.media ? 3 : 0)
    + (item.price != null || item.salePrice != null || item.sale_price != null || offers ? 3 : 0)
    + (item.description || item.shortDescription ? 1 : 0);
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
  if (/(?:frete|entrega)\s+gr[aá]tis[^.]{0,80}(?:acima|a partir|minim|above|over)/i.test(value)) return null;
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

function isSameProductDocument(mediaUrl: string, productUrl: string) {
  try {
    const media = new URL(mediaUrl);
    const product = new URL(productUrl);
    return media.hostname === product.hostname && media.pathname === product.pathname;
  } catch {
    return false;
  }
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
  const jsonLdProduct = json.find((item) => {
    const type = item["@type"];
    return type === "Product" || (Array.isArray(type) && type.includes("Product"));
  });
  const embeddedProduct = embeddedProductRecords(html).sort((a, b) => productScore(b) - productScore(a))[0];
  const product = jsonLdProduct || embeddedProduct || {};
  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
  const offer = typeof offers === "object" && offers ? offers as Record<string, unknown> : {};
  const productImageUrls = strings(product.image).concat(strings(product.images), strings(product.gallery), strings(product.media), strings(product.associatedMedia));
  const readerTitle = html.match(/^Title:\s*(.+)$/mi)?.[1] || "";
  const htmlImageUrls = [...productPageHtml.matchAll(/<img\b[^>]+(?:src|data-src|data-original|data-zoom-image)=["']([^"']+)["']/gi)].map((m) => m[1]);
  const readerGallery = readerTitle
    ? html.split(/PRODUTOS RELACIONADOS/i)[0]
    : "";
  const readerImageUrls = [...readerGallery.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)[^)]*\)/gi)].map((m) => m[1]);
  const ogImages = [meta(html, "og:image"), meta(html, "twitter:image")];
  const videoUrls = [
    ...strings(product.video), ...strings(product.videos),
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
  const brand = typeof product.brand === "object" && product.brand ? String((product.brand as Record<string, unknown>).name || "") : String(product.brand || product.manufacturer || "");
  const availabilityRaw = String(offer.availability || meta(html, "product:availability") || "").toLowerCase();
  const ogTitle = meta(html, "og:title");
  const titleSource = String(product.name || product.title || ogTitle || readerTitle || "");
  const title = titleSource.replace(/^comprar\s+/i, "").replace(/\s*[-|–]\s*R\$\s*[\d.,]+.*$/i, "").trim();
  const priceFromTitle = titleSource.match(/R\$\s*([\d.,]+)/i)?.[1];
  const readerProductSection = readerTitle && title
    ? html.match(new RegExp(`###\\s+${escapeRegex(title)}[\\s\\S]{0,5000}`, "i"))?.[0] || ""
    : "";
  const readerMainPrice = readerProductSection.match(/R\$\s*([\d.,]+)/i)?.[1];
  const pageItempropPrice = productPageHtml.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || productPageHtml.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i)?.[1];
  const pricePair = productPageHtml.match(/de\s*R\$\s*([\d.,]+)\s*por\s*(?:\n|\s)*R\$\s*([\d.,]+)/i);
  const previousPriceHtml = productPageHtml.match(/class=["'][^"']*\bvalor_de\b[^"']*["'][^>]*>[\s\S]{0,500}?R\$\s*([\d.,]+)/i)?.[1];
  return {
    title,
    brand,
    store: base.hostname.replace(/^www\./, ""),
    description: String(product.description || product.shortDescription || meta(html, "og:description") || meta(html, "description") || ""),
    price: numberOrNull(offer.price || meta(html, "product:price:amount") || meta(html, "og:price:amount") || product.salePrice || product.sale_price || product.price || pageItempropPrice || readerMainPrice || pricePair?.[2] || priceFromTitle),
    previousPrice: numberOrNull(offer.highPrice || offer.priceBefore || offer.compareAtPrice || product.previousPrice || product.listPrice || product.compareAtPrice || previousPriceHtml || pricePair?.[1]),
    shippingPrice: shippingFromText(productPageHtml) ?? shippingFromText(html),
    currency: String(offer.priceCurrency || meta(html, "product:price:currency") || "BRL"),
    category: String(product.category || product.productType || ""),
    availability: availabilityRaw.includes("instock") || availabilityRaw.includes("in_stock") ? "in_stock" : availabilityRaw.includes("outofstock") ? "out_of_stock" : "unknown",
    media: dedupeMedia([...selectedImages.map((url) => ({ type: "image" as const, url })), ...videos.map((url) => ({ type: "video" as const, url }))]),
  };
}

function previewLooksIncomplete(preview: Omit<LinkPreview, "originalUrl" | "normalizedUrl">) {
  return !preview.title || /^www\./i.test(preview.title) || preview.price == null || !preview.media.length;
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
        input: [{ role: "system", content: "Extraia somente dados comprovados do HTML de uma pagina de produto. Nunca invente valores ou URLs. Retorne JSON puro com title, brand, price, previousPrice, shippingPrice, description, pAvailability (true somente se P estiver selecionável; false se P estiver ausente/esgotado; null se não houver evidência) e media (lista de {type:'image'|'video',url})." }, { role: "user", content: JSON.stringify({ url, html: html.slice(0, 70_000) }) }],
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
    return { title: typeof data.title === "string" ? data.title.trim() : "", brand: typeof data.brand === "string" ? data.brand.trim() : "", description: typeof data.description === "string" ? data.description.trim() : "", price: numberOrNull(data.price), previousPrice: numberOrNull(data.previousPrice), shippingPrice: numberOrNull(data.shippingPrice), pAvailability: typeof data.pAvailability === "boolean" ? data.pAvailability : null, media: dedupeMedia(media) };
  } catch {
    return null;
  }
}

export const linkImportService = {
  async preview(raw: string, includeDebug = false): Promise<LinkPreview> {
    const traceId = randomUUID();
    const errors: string[] = [];
    const normalizedUrl = normalizeFindingUrl(raw);
    let { response, finalUrl } = await fetchPublicPage(normalizedUrl);
    let externalStatus: number | null = response.status;
    let currentUrl = normalizeFindingUrl(response.url || finalUrl);
    let initialContent = await response.text();
    // Search, affiliate and tracking links can return a 200 "continuing to the
    // store" document instead of an HTTP 3xx. Follow only an explicit HTML or
    // JavaScript redirect, then scrape the actual product URL.
    for (let hop = 0; hop < 2; hop += 1) {
      const target = htmlRedirectTarget(initialContent, currentUrl);
      if (!target || normalizeFindingUrl(target) === currentUrl) break;
      try {
        ({ response, finalUrl } = await fetchPublicPage(target));
        externalStatus = response.status;
      } catch (error) {
        errors.push(`html_redirect:${error instanceof Error ? error.message : "failed"}`);
        break;
      }
      currentUrl = normalizeFindingUrl(response.url || finalUrl);
      initialContent = await response.text();
    }
    const originalUrl = currentUrl;
    const isBotCheck = new URL(originalUrl).pathname.includes("anti-bot-check");
    const isBotContent = /anti-bot-check|checking your browser|verificando seu navegador/i.test(initialContent);
    let content = initialContent;
    let productUrl = isBotCheck ? normalizedUrl : originalUrl;
    let parsed = extractProductFromHtml(content, productUrl);
    if (isBotCheck || isBotContent) {
      try {
        const readerContent = await fetchReaderFallback(normalizedUrl);
        const readerRedirect = htmlRedirectTarget(readerContent, productUrl);
        let readerUrl = productUrl;
        let resolvedReaderContent = readerContent;
        if (readerRedirect && normalizeFindingUrl(readerRedirect) !== productUrl) {
          const readerResponse = await fetchPublicPage(readerRedirect);
          readerUrl = normalizeFindingUrl(readerResponse.response.url || readerResponse.finalUrl);
          resolvedReaderContent = await readerResponse.response.text();
          productUrl = readerUrl;
        }
        const readerPreview = extractProductFromHtml(resolvedReaderContent, readerUrl);
        // The reader can return a generic 404/anti-bot page. Keep the original
        // response unless this alternative actually contains more product data.
        if (previewScore(readerPreview) > previewScore(parsed)) {
          content = resolvedReaderContent;
          parsed = readerPreview;
        } else if (/continuando\s+para\s+a?\s*loja|redirecionando|redirecting/i.test(readerContent)) {
          errors.push("reader:intermediate_landing_page");
        }
      } catch (error) { errors.push(`reader:${error instanceof Error ? error.message : "failed"}`); }
    }
    const directPAvailability = requestedSizeAvailability(content, "P");
    const shouldAskSizeAi = directPAvailability === null && /tamanho|sizes?|variac|option/i.test(content);
    // AI receives only this page's HTML. It is a parser of the submitted URL,
    // never a product-search fallback.
    const aiNeeded = previewLooksIncomplete(parsed) || shouldAskSizeAi;
    const ai = aiNeeded ? await aiFallback(content, productUrl) : null;
    if (aiNeeded && !ai) errors.push("ai:no_result_or_not_configured");
    const pAvailability = directPAvailability ?? ai?.pAvailability ?? null;
    const rawMedia = dedupeMedia([...(parsed.media || []), ...(ai?.media || [])])
      // A landing page URL is HTML, not an image. Never pass it to the UI as
      // a gallery item when a store's fallback document contains a bare link.
      .filter((item) => !isSameProductDocument(item.url, productUrl));
    // Never send an anti-bot page, HTML document, or broken asset as the
    // product photo. The first media item is later used for the Product card.
    const [validatedMedia, shippingQuote] = await Promise.all([
      keepUsableMedia(rawMedia),
      quoteLowestShipping(productUrl).catch((error) => { errors.push(`shipping:${error instanceof Error ? error.message : "failed"}`); return null; }),
    ]);
    // Some stores reject server-side range requests even though their CDN image
    // works in the customer's browser. Preserve the original gallery in that
    // case instead of returning an empty product preview.
    const media = validatedMedia.length ? validatedMedia : rawMedia;
    const debug: LinkImportDebug = {
      traceId,
      receivedUrl: normalizedUrl,
      externalStatus,
      finalUrl: productUrl,
      htmlLength: content.length,
      jsonLdFound: /application\/ld\+json/i.test(content),
      openGraphFound: /(?:property|name)=["']og:/i.test(content),
      embeddedProductFound: /\b(?:product(?:json|data)?|pdp|item)\s*[:=]/i.test(content),
      strategies: ["http", "redirects", "json-ld", "open-graph", "embedded-json", "html", ...(isBotCheck || isBotContent ? ["reader"] : []), ...(aiNeeded ? ["ai"] : []), "shipping"],
      extractorUsed: parsed.title || parsed.price != null || parsed.media.length ? "page-content" : ai ? "ai-page-content" : "none",
      aiFallbackUsed: Boolean(ai),
      errors,
    };
    const result: LinkPreview = {
      ...parsed,
      title: parsed.title && !/^www\./i.test(parsed.title) ? parsed.title : ai?.title || "",
      brand: parsed.brand || ai?.brand || "",
      description: parsed.description || ai?.description || "",
      price: parsed.price ?? ai?.price ?? null,
      previousPrice: parsed.previousPrice ?? ai?.previousPrice ?? null,
      shippingPrice: shippingQuote?.price ?? parsed.shippingPrice ?? ai?.shippingPrice ?? null,
      store: parsed.store || new URL(productUrl).hostname.replace(/^www\./, ""),
      // For a link import, availability means the preferred P variation, not
      // merely a generic buy button for another size.
      availability: pAvailability === true ? "in_stock" : pAvailability === false ? "out_of_stock" : "unknown",
      media,
      originalUrl: productUrl,
      normalizedUrl: productUrl,
    };
    console.info("[link-import]", JSON.stringify({ ...debug, result: { title: result.title, price: result.price, mediaCount: result.media.length, availability: result.availability, shippingPrice: result.shippingPrice } }));
    return includeDebug ? { ...result, debug } : result;
  },
};
