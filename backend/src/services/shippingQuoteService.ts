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
  for (const match of content.matchAll(/data-index=["']([\d.]+)["'][\s\S]{0,900}?<span[^>]*class=["'][^"']*servico[^"']*["'][^>]*>\s*([^<]+?)\s*<\/span>[\s\S]{0,500}?<span[^>]*class=["'][^"']*prazo[^"']*["'][^>]*>\s*([^<]+?)(?:<|$)/gi)) {
    const price = Number(match[1]);
    const service = match[2].replace(/\s+/g, " ").trim();
    if (!Number.isFinite(price) || /retirada|pickup/i.test(service)) continue;
    const days = match[3].match(/(\d{1,2})\s*dias?/i)?.[1];
    quotes.push({ price, service: service || null, deliveryDays: days ? Number(days) : null, cep });
  }
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
    const fields: Record<string, string> = {};
    for (const input of match[2].matchAll(/<input\b[^>]*>/gi)) {
      const tag = input[0];
      const fieldName = tag.match(/\bname=["']([^"']+)/i)?.[1];
      if (!fieldName) continue;
      fields[fieldName] = tag.match(/\bvalue=["']([^"']*)/i)?.[1] || "";
    }
    const name = Object.keys(fields).find((value) => /cep|zip|postal/i.test(value));
    const target = new URL(action, base);
    // Generic form support is deliberately same-origin only.
    if (target.origin !== base.origin || !name) continue;
    return { target, method, name, fields };
  }
  return null;
}

async function shippingFragment(html: string, pageUrl: URL) {
  const loaded = html.match(/\.load\(\s*["']([^"']*(?:frete|shipping)[^"']*)["']/i)?.[1];
  if (!loaded) return null;
  // Storefront fragments are commonly written as `inc.php?...` but served
  // from the origin root, regardless of the friendly product-page route.
  const target = loaded.startsWith("/") ? new URL(loaded, pageUrl) : new URL(`/${loaded}`, pageUrl.origin);
  const result = await fetchPublic(target, {
    headers: { referer: pageUrl.toString(), "x-requested-with": "XMLHttpRequest" },
  });
  if (!result.response.ok) return null;
  return { html: await result.response.text(), url: result.url };
}

function componentData(attributes: string) {
  const fields: Record<string, string> = {};
  for (const item of attributes.matchAll(/\bdata-([\w-]+)=["']([^"']*)/gi)) {
    fields[item[1]] = item[2];
  }
  return fields;
}

async function componentShippingResults(html: string, pageUrl: URL) {
  const components = [...html.matchAll(/<component\b([^>]*)>/gi)]
    .map((match) => componentData(match[1]))
    .filter((data) => data.modulo && /frete|shipping/i.test(data.modulo));
  if (!components.length) return [];
  const endpoint = new URL("/loadcomponents", pageUrl.origin);
  const responses = await Promise.all(components.map(async (data) => {
    try {
      const result = await fetchPublic(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", referer: pageUrl.toString(), "x-requested-with": "XMLHttpRequest" },
        body: new URLSearchParams(data).toString(),
      });
      return result.response.ok ? await result.response.text() : "";
    } catch {
      return "";
    }
  }));
  return responses.filter(Boolean);
}

/**
 * Best-effort, brand-agnostic quote. It submits a conventional shipping form
 * when the page has one and otherwise reads only an already quoted price.
 */
export async function quoteLowestShipping(purchaseUrl: string, cep = DEFAULT_SHIPPING_CEP): Promise<ShippingQuote | null> {
  const { response, url } = await fetchPublic(await publicUrl(purchaseUrl));
  if (!response.ok) return null;
  const html = await response.text();
  const fragment = await shippingFragment(html, url).catch(() => null);
  const form = shippingForm(fragment?.html || html, fragment?.url || url);
  let quoteContent = html;
  if (form) {
    const params = new URLSearchParams({ ...form.fields, [form.name]: cep });
    const result = form.method === "POST"
      ? await fetchPublic(form.target, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", referer: url.toString(), "x-requested-with": "XMLHttpRequest" }, body: params.toString() })
      : await fetchPublic(new URL(`${form.target}${form.target.search ? "&" : "?"}${params.toString()}`), { headers: { referer: url.toString(), "x-requested-with": "XMLHttpRequest" } });
    if (result.response.ok) quoteContent = await result.response.text();
  }
  const componentResults = await componentShippingResults(quoteContent, url);
  const quotes = quotesFrom([quoteContent, ...componentResults].join("\n"), cep);
  if (!quotes.length) return null;
  return quotes.sort((a, b) => a.price - b.price || (a.deliveryDays ?? Number.MAX_SAFE_INTEGER) - (b.deliveryDays ?? Number.MAX_SAFE_INTEGER))[0];
}
