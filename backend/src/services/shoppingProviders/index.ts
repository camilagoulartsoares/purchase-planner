import { mercadoLivreProvider } from "./mercadoLivreProvider.js";
import { pendingProvider } from "./pendingProvider.js";
import type { ShoppingProvider } from "./types.js";

export const shoppingProviders: ShoppingProvider[] = [
  mercadoLivreProvider,
  pendingProvider("amazon_brasil"),
  pendingProvider("shopee_brasil"),
  pendingProvider("epoca_cosmeticos"),
  pendingProvider("beleza_na_web"),
];

export * from "./types.js";
