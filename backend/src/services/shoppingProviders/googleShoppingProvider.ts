import { env } from "../../config/env.js";
import { SerpApiProductSearchProvider } from "../serpApiProductSearchProvider.js";
import type { ShoppingOffer, ShoppingProvider } from "./types.js";

const unavailable = /indispon[ií]vel|out of stock|esgotado/i;
const freeShipping = /frete\s*gr[aá]tis|free shipping/i;

// Reaproveita a mesma fonte ampla do Personal Shopper. A consulta recebe sempre
// o termo da usuária; não há catálogo, marca ou produto fixado no código.
export const googleShoppingProvider: ShoppingProvider = {
  id: "google_shopping",
  status: env.serpApi.apiKey ? "operational" : "awaiting_integration",
  async search(searchTerm) {
    const provider = new SerpApiProductSearchProvider();
    const results = await provider.search({ query: searchTerm, category: null, maxPrice: null, maxPriceIsHard: false, currency: "BRL", colors: [], size: null, brands: [], usage: null, style: [], exclude: [], originalOnly: false, sortPreference: "best_match" });
    return results.filter((item) => item.price != null).map((item): ShoppingOffer => {
      const shipping = item.shipping && freeShipping.test(item.shipping) ? 0 : null;
      const availability = item.availability && unavailable.test(item.availability) ? "out_of_stock" : "in_stock";
      return {
        store: item.store || "Loja informada pelo Google Shopping", title: item.title, price: item.price!, shipping,
        totalPrice: shipping == null ? null : item.price! + shipping, originalPrice: item.previousPrice,
        discountPercentage: item.discountPercent, url: item.productUrl, imageUrl: item.imageUrl,
        seller: null, availability,
      };
    });
  },
};
