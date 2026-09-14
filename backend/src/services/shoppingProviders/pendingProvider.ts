import type { ShoppingProvider } from "./types.js";

export function pendingProvider(id: string): ShoppingProvider {
  return { id, status: "awaiting_integration", async search() { return []; } };
}
