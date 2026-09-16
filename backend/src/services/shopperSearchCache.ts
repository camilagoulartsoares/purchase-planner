import type { SearchedProduct, ShopperQuery } from "./productSearchProvider.js";

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 80;
type Entry = { expiresAt: number; conversationId: string; queryKey: string; results: SearchedProduct[] };
const entries = new Map<string, Entry>();
const keyFor = (conversationId: string, query: ShopperQuery) => `${conversationId}:${JSON.stringify(query)}`;

function prune() { const now = Date.now(); for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key); while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!); }

export const shopperSearchCache = {
  get(conversationId: string, query: ShopperQuery) { prune(); const key = keyFor(conversationId, query); const entry = entries.get(key); if (!entry) return null; entries.delete(key); entries.set(key, entry); return entry.results; },
  set(conversationId: string, query: ShopperQuery, results: SearchedProduct[]) { prune(); const key = keyFor(conversationId, query); entries.delete(key); entries.set(key, { conversationId, queryKey: key, results, expiresAt: Date.now() + TTL_MS }); prune(); },
  result(conversationId: string, resultId: string) { prune(); for (const entry of entries.values()) if (entry.conversationId === conversationId) { const result = entry.results.find((item) => item.id === resultId); if (result) return result; } return null; },
  clear() { entries.clear(); },
  stats() { prune(); return { size: entries.size, maxEntries: MAX_ENTRIES, ttlMs: TTL_MS }; },
};
