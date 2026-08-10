import dns from "node:dns/promises";

export const DEFAULT_SHIPPING_CEP = "37500224";

export type ShippingQuote = {
  price: number;
  service: string | null;
  deliveryDays: number | null;
  cep: string;
};

function privateAddress(address: string) {
  return address === "::1" || address === "::" || address.startsWith("127.") || address.startsWith("10.") || address.startsWith("192.168.") || address.startsWith("169.254.") || /^172\.(1[6-9]|2\d|3[01])\./.test(address) || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
}

async function publicUrl(value: string) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.hostname === "localhost" || url.hostname.endsWith(".localhost")) throw new Error("URL não permitida para cotação.");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address.toLowerCase()))) throw new Error("URL não permitida para cotação.");
  return url;
}

async function fetchPublic(url: URL, init: RequestInit = {}) {
  let current = url;
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    await publicUrl(current.toString());
    const response = await fetch(current, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36", "accept-language": "pt-BR,pt;q=0.9", ...(init.headers || {}) },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      current = await publicUrl(new URL(response.headers.get("location")!, current).toString());
      continue;
    }
    return { response, url: current };
  }
  throw new Error("Muitos redirecionamentos na cotação.");
}

function money(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function quotesFrom(content: string, cep: string): ShippingQuote[] {
  const quotes: ShippingQuote[] = [];
  const pattern = /(?:frete|entrega|sedex|pac|transportadora|shipping)[^R$]{0,100}R\$\s*([\d.]+,\d{2})/gi;
  for (const match of content.matchAll(pattern)) {
    const price = money(match[1]);
    if (price == null) continue;
    const fragment = match[0].replace(/\s+/g, " ").trim();
    const days = fragment.match(/(\d{1,2})\s*(?:dia|dias|úteis)/i)?.[1];
    quotes.push({ price, service: fragment.replace(/R\$[\s\d.,]+/i, "").trim() || null, deliveryDays: days ? Number(days) : null, cep });
  }
  return quotes;
}

function shippingForm(html: string, base: URL) {
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]{0,12000}?)<\/form>/gi)) {
    const all = `${match[1]} ${match[2]}`;
    if (!/frete|shipping|entrega|\bcep\b|zipcode|postal/i.test(all)) continue;
    const action = match[1].match(/\baction=["']([^"']*)/i)?.[1] || base.pathname;
    const method = (match[1].match(/\bmethod=["']([^"']+)/i)?.[1] || "GET").toUpperCase();
    const name = [...match[2].matchAll(/<input\b[^>]*\bname=["']([^"']+)/gi)].map((item) => item[1]).find((value) => /cep|zip|postal/i.test(value));
    const target = new URL(action, base);
    // Generic form support is deliberately same-origin only.
    if (target.origin !== base.origin || !name) continue;
    return { target, method, name };
  }
  return null;
}

/**
 * Best-effort, brand-agnostic quote. It submits a conventional shipping form
 * when the page has one and otherwise reads only an already quoted price.
 */
export async function quoteLowestShipping(purchaseUrl: string, cep = DEFAULT_SHIPPING_CEP): Promise<ShippingQuote | null> {
  const { response, url } = await fetchPublic(await publicUrl(purchaseUrl));
  if (!response.ok) return null;
  const html = await response.text();
  const form = shippingForm(html, url);
  let quoteContent = html;
  if (form) {
    const params = new URLSearchParams({ [form.name]: cep });
    const result = form.method === "POST"
      ? await fetchPublic(form.target, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString() })
      : await fetchPublic(new URL(`${form.target}${form.target.search ? "&" : "?"}${params.toString()}`));
    if (result.response.ok) quoteContent = await result.response.text();
  }
  const quotes = quotesFrom(quoteContent, cep);
  if (!quotes.length) return null;
  return quotes.sort((a, b) => a.price - b.price || (a.deliveryDays ?? Number.MAX_SAFE_INTEGER) - (b.deliveryDays ?? Number.MAX_SAFE_INTEGER))[0];
}
