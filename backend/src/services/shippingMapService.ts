import dns from "node:dns/promises";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";

const CEP = "37500224";
const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  "accept-language": "pt-BR,pt;q=0.9",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

type Quote = { shippingPrice: number; deliveryDays: number | null; service: string | null };
type ShippingMapProduct = Prisma.ProductGetPayload<{ include: { brand: true; shippingQuotes: true } }>;

function isPrivateAddress(address: string) {
  return address === "::1" || address === "::" || address.startsWith("127.") || address.startsWith("10.") ||
    address.startsWith("0.") || address.startsWith("169.254.") || address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address) || /^(fc|fd|fe80:)/i.test(address);
}

async function assertPublic(url: URL) {
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) throw new Error("endereço não público");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("endereço não público");
}

async function getPublicPage(initialUrl: string, ajaxReferer?: string) {
  let current = new URL(initialUrl);
  for (let i = 0; i < 4; i += 1) {
    await assertPublic(current);
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(12_000), headers: ajaxReferer ? { ...BROWSER_HEADERS, referer: ajaxReferer, "x-requested-with": "XMLHttpRequest" } : BROWSER_HEADERS });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      current = new URL(response.headers.get("location")!, current);
      continue;
    }
    if (!response.ok) throw new Error(`página retornou ${response.status}`);
    return { url: current, html: await response.text() };
  }
  throw new Error("muitos redirecionamentos");
}

async function postPublic(url: URL, body: URLSearchParams, referer: string) {
  await assertPublic(url);
  const response = await fetch(url, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000),
    headers: { ...BROWSER_HEADERS, referer, "x-requested-with": "XMLHttpRequest", "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`consulta retornou ${response.status}`);
  return response.text();
}

function entity(value: string) { return value.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'); }
function attribute(html: string, name: string) { return entity(html.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || ""); }
function money(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : null;
}

export async function quoteWbuy(purchaseUrl: string): Promise<Quote | null> {
  const productPage = await getPublicPage(purchaseUrl);
  const load = productPage.html.match(/['"](inc\.php\?meio=inc_calculo_frete[^'"]+)['"]/i)?.[1];
  if (!load) return null;

  const freightForm = await getPublicPage(new URL(`/${entity(load).replace(/^\//, "")}`, productPage.url.origin).toString(), productPage.url.toString());
  const productsMatch = freightForm.html.match(/name=["']produtos["']\s+value=["']([^"']+)["']/i);
  if (!productsMatch) return null;
  const form = new URLSearchParams({
    cep: CEP, funcao: "opcoes", return: "#result_frete", prazo_add: "0", produtos: entity(productsMatch[1]), typeform: "product_detail", quantidade: "1",
  });
  const optionsPage = await postPublic(new URL("frete_func.php", freightForm.url), form, productPage.url.toString());
  const components = optionsPage.match(/<component\b[^>]*data-modulo=["']frete-metodo["'][^>]*>/gi) || [];
  const results = await Promise.all(components.slice(0, 6).map(async (component) => {
    const type = attribute(component, "data-tipo");
    if (!type || /retirada/i.test(type)) return "";
    const request = new URLSearchParams({
      modulo: "frete-metodo", tipo: type, typeform: attribute(component, "data-typeform") || "product_detail",
      hash: attribute(component, "data-hash"), cep: CEP, funcao: "getByService", return: "#result_frete",
      prazo_add: attribute(component, "data-prazo_add") || "0", produtos: attribute(component, "data-produtos"),
      quantidade: attribute(component, "data-quantidade") || "1",
    });
    try { return await postPublic(new URL("loadcomponents", freightForm.url), request, productPage.url.toString()); } catch { return ""; }
  }));

  const options: Quote[] = [];
  for (const html of results) {
    const starts = [...html.matchAll(/<div\b(?=[^>]*\bfrete-opcao\b)[^>]*>/gi)];
    const cards = starts.length ? starts.map((start, index) => html.slice(start.index!, starts[index + 1]?.index)) : [html];
    for (const card of cards) {
      const value = money(card.match(/data-index=["']([^"']+)/i)?.[1] || card.match(/class=["'][^"']*valor[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || "");
      if (value === null || value < 0) continue;
      const service = card.match(/class=["'][^"']*servico[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]?.replace(/<[^>]+>/g, "").trim() || null;
      const deliveryDays = Number(card.match(/até\s+(\d+)\s+dias/i)?.[1] || card.match(/Prazo[^:]*:\s*(\d+)/i)?.[1]) || null;
      options.push({ shippingPrice: value, deliveryDays, service });
    }
  }
  return options.sort((a, b) => a.shippingPrice - b.shippingPrice)[0] || null;
}

function mapItem(product: ShippingMapProduct) {
  const quote = product.shippingQuotes[0];
  const price = Number(product.promotionalPrice ?? product.originalPrice);
  const shipping = quote ? Number(quote.shippingPrice) : product.shippingPrice == null ? null : Number(product.shippingPrice);
  const discount = product.promotionalPrice != null ? Math.max(0, Number(product.originalPrice) - Number(product.promotionalPrice)) : 0;
  return {
    productId: product.id, name: product.name, brand: product.brand.name, store: product.store, purchaseUrl: product.purchaseUrl,
    price, shipping, coupon: null, couponNote: null, discount, total: shipping === null ? null : price + shipping - discount,
    deliveryDays: quote?.deliveryDays ?? null, cep: CEP, checkedAt: quote?.checkedAt.toISOString() ?? null,
    shippingStatus: !product.purchaseUrl ? "missing_link" : shipping === null ? "unavailable" : "available",
    shippingMessage: !product.purchaseUrl ? "Adicione o link específico do produto." : quote ? `Cotação automática${quote.service ? `: ${quote.service}` : ""}.` : shipping === null ? "Frete indisponível para consulta automática" : "Frete informado no produto.",
  };
}

export const shippingMapService = {
  async list(userId: string) {
    const products = await prisma.product.findMany({ where: { userId }, include: { brand: true, shippingQuotes: { where: { cep: CEP }, orderBy: { checkedAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } });
    const checkedAt = new Date().toISOString();
    const items = products.map(mapItem).sort((a, b) => (a.total ?? Number.MAX_SAFE_INTEGER) - (b.total ?? Number.MAX_SAFE_INTEGER));
    return { cep: CEP, checkedAt, items };
  },

  async refresh(userId: string) {
    const products = await prisma.product.findMany({ where: { userId, purchaseUrl: { not: null } }, select: { id: true, purchaseUrl: true } });
    for (const product of products) {
      try {
        const quote = await quoteWbuy(product.purchaseUrl!);
        if (quote) await prisma.shippingQuote.upsert({ where: { productId_cep: { productId: product.id, cep: CEP } }, create: { productId: product.id, cep: CEP, ...quote }, update: { ...quote, checkedAt: new Date() } });
      } catch { /* A loja bloqueou ou não expõe cálculo público: mantém o produto visível. */ }
    }
    return this.list(userId);
  },

  async updateLink(userId: string, productId: string, purchaseUrl: string) {
    try { const url = new URL(purchaseUrl); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { throw new AppError("Informe um link HTTP ou HTTPS válido.", 400); }
    const product = await prisma.product.findFirst({ where: { id: productId, userId } });
    if (!product) throw new AppError("Produto não encontrado.", 404);
    await prisma.product.update({ where: { id: productId }, data: { purchaseUrl } });
    return { productId, purchaseUrl };
  },
};
