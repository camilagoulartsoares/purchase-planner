/** Run from backend: npx tsx scripts/measure-shopper-discovery.ts "kit shampoo Wella" */
import { discoverProducts } from "../src/services/shopperDiscoveryService.js";
import type { ShopperQuery } from "../src/services/productSearchProvider.js";

const phrase = process.argv.slice(2).join(" ") || "kit shampoo Wella";
const query: ShopperQuery = { query: phrase, category: null, maxPrice: null, maxPriceIsHard: false, currency: "BRL", colors: [], size: null, brands: [], usage: null, style: [], exclude: [], originalOnly: false, sortPreference: "best_match" };
const result = await discoverProducts(query);
console.log(JSON.stringify({
  ...result.metrics,
  examples: result.variations.slice(0, 15).map((variation) => ({ title: variation.title, offers: variation.offers.length, stores: variation.offers.map((offer) => offer.store), prices: variation.offers.map((offer) => offer.price) })),
}, null, 2));
