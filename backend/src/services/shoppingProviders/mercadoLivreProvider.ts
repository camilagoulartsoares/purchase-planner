import type { ShoppingOffer, ShoppingProvider } from "./types.js";

type MeliResult = { id: string; title: string; price: number; original_price?: number | null; permalink: string; thumbnail?: string; available_quantity?: number; seller?: { nickname?: string }; shipping?: { free_shipping?: boolean } };

export const mercadoLivreProvider: ShoppingProvider = {
  id: "mercado_livre",
  status: "operational",
  async search(searchTerm) {
    const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
    url.searchParams.set("q", searchTerm);
    url.searchParams.set("limit", "20");
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Mercado Livre respondeu ${response.status}`);
    const body = await response.json() as { results?: MeliResult[] };
    return (body.results || []).map((item) => {
      // A API de busca só confirma frete grátis. Outros valores exigem item/CEP e
      // permanecem desconhecidos, portanto não podem disparar alerta automático.
      const shipping = item.shipping?.free_shipping ? 0 : null;
      const originalPrice = item.original_price ?? null;
      return {
        store: "Mercado Livre", title: item.title, price: item.price, shipping,
        totalPrice: shipping == null ? null : item.price + shipping,
        originalPrice,
        discountPercentage: originalPrice && originalPrice > item.price ? Math.round((1 - item.price / originalPrice) * 100) : null,
        url: item.permalink, imageUrl: item.thumbnail || null, seller: item.seller?.nickname || null,
        availability: item.available_quantity === 0 ? "out_of_stock" : "in_stock",
      };
    });
  },
};
