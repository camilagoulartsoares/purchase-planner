/** From backend: npx tsx scripts/audit-shopper-recovery.ts [--check] [--output path] */
import { writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { env } from "../src/config/env.js";
import { SerpApiProductSearchProvider } from "../src/services/serpApiProductSearchProvider.js";
import { interpretShopperIntent } from "../src/services/shopperIntentService.js";
import { discoverProducts } from "../src/services/shopperDiscoveryService.js";

process.env.NODE_ENV = "production";

const defaultQueries = [
  "kit shampoo e condicionador wella 1l invigo",
  "crocs feminino preto tamanho 36",
  "notebook lenovo i5 16gb",
  "perfume feminino 100ml até 400 reais",
  "ração golden gatos castrados 10kg",
  "air fryer 5 litros",
];
const requestedQuery = process.argv.indexOf("--query");
const queries = requestedQuery >= 0 ? [process.argv[requestedQuery + 1]].filter(Boolean) : defaultQueries;
if (requestedQuery >= 0 && !queries.length) throw new Error("Informe uma consulta após --query.");

type Counts = { shoppingResults: number; inlineShoppingResults: number; categorizedShoppingResults: number; organicResults: number; immersiveProducts: number; productPricing: number; detailStores: number };
type NetworkCall = { id: number; engine: string; phrase: string | null; startedAt: number; endedAt?: number; durationMs?: number; httpStatus?: number; status: "pending" | "ok" | "http_error" | "provider_error" | "request_failed"; error?: string; counts: Counts };
type StageCall = { stage: string; phrase: string; productId?: string; title?: string; startedAt: number; endedAt?: number; durationMs?: number; status: "pending" | "ok" | "failed"; resultCount?: number; rawCount?: number; error?: string };
type Trace = { network: NetworkCall[]; stages: StageCall[] };
type RawBody = { error?: string; shopping_results?: unknown[]; inline_shopping_results?: unknown[]; categorized_shopping_results?: Array<{ shopping_results?: unknown[] }>; organic_results?: unknown[]; immersive_products?: unknown[]; product_result?: { pricing?: unknown[] }; product_results?: { stores?: unknown[] } };

const emptyCounts = (): Counts => ({ shoppingResults: 0, inlineShoppingResults: 0, categorizedShoppingResults: 0, organicResults: 0, immersiveProducts: 0, productPricing: 0, detailStores: 0 });
const countBy = <T>(items: T[], key: (item: T) => string) => items.reduce<Record<string, number>>((out, item) => { const label = key(item); out[label] = (out[label] || 0) + 1; return out; }, {});
const total = (items: NetworkCall[], field: keyof Counts) => items.reduce((sum, item) => sum + item.counts[field], 0);
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : "tmp-audit-results.json";
if (!outputPath) throw new Error("Informe um caminho após --output.");

// This mode exits before installing the fetch tracer or reading the API key.
if (process.argv.includes("--check")) {
  assert.equal(queries.length, requestedQuery >= 0 ? 1 : 6);
  assert.equal(new Set(queries).size, queries.length);
  assert.equal(total([{ id: 1, engine: "google", phrase: "teste", startedAt: 0, status: "ok", counts: { ...emptyCounts(), immersiveProducts: 2 } }], "immersiveProducts"), 2);
  console.log(JSON.stringify({ check: "ok", networkCalls: 0, queries: queries.length, outputPath }));
  process.exit(0);
}

if (!env.serpApi.apiKey) throw new Error("SERPAPI_API_KEY ausente. Configure backend/.env antes da auditoria.");

let activeTrace: Trace | null = null;
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const trace = activeTrace;
  if (!trace || url.hostname !== "serpapi.com") return nativeFetch(input, init);
  const call: NetworkCall = { id: trace.network.length + 1, engine: url.searchParams.get("engine") || "unknown", phrase: url.searchParams.get("q"), startedAt: Date.now(), status: "pending", counts: emptyCounts() };
  trace.network.push(call);
  try {
    const response = await nativeFetch(input, init);
    const body = await response.clone().json() as RawBody;
    call.endedAt = Date.now();
    call.durationMs = call.endedAt - call.startedAt;
    call.httpStatus = response.status;
    call.status = !response.ok ? "http_error" : body.error ? "provider_error" : "ok";
    call.error = body.error || (!response.ok ? `HTTP ${response.status}` : undefined);
    call.counts = { shoppingResults: body.shopping_results?.length || 0, inlineShoppingResults: body.inline_shopping_results?.length || 0, categorizedShoppingResults: body.categorized_shopping_results?.reduce((count, category) => count + (category.shopping_results?.length || 0), 0) || 0, organicResults: body.organic_results?.length || 0, immersiveProducts: body.immersive_products?.length || 0, productPricing: body.product_result?.pricing?.length || 0, detailStores: body.product_results?.stores?.length || 0 };
    return response;
  } catch (error) {
    call.endedAt = Date.now();
    call.durationMs = call.endedAt - call.startedAt;
    call.status = "request_failed";
    call.error = errorText(error);
    throw error;
  }
};

function traceProvider(provider: SerpApiProductSearchProvider, trace: Trace) {
  const run = async <T>(entry: StageCall, work: () => Promise<T>, size: (result: T) => { resultCount: number; rawCount?: number }) => {
    trace.stages.push(entry);
    try {
      const result = await work();
      entry.endedAt = Date.now(); entry.durationMs = entry.endedAt - entry.startedAt; entry.status = "ok";
      Object.assign(entry, size(result));
      return result;
    } catch (error) {
      entry.endedAt = Date.now(); entry.durationMs = entry.endedAt - entry.startedAt; entry.status = "failed"; entry.error = errorText(error);
      throw error;
    }
  };
  const google = provider.searchGoogleResults.bind(provider);
  provider.searchGoogleResults = (query) => run({ stage: "google", phrase: query.query, startedAt: Date.now(), status: "pending" }, () => google(query), (result) => ({ resultCount: result.length }));
  const shopping = provider.searchDetailed.bind(provider);
  provider.searchDetailed = (query, phrase, engine) => run({ stage: engine || "google_shopping", phrase, startedAt: Date.now(), status: "pending" }, () => shopping(query, phrase, engine), (result) => ({ resultCount: result.results.length, rawCount: result.rawCount }));
  const details = provider.offersFor.bind(provider);
  provider.offersFor = (candidate, query, nextPageToken) => run({ stage: nextPageToken ? "google_immersive_store_page" : "google_immersive_product", phrase: candidate.sourceQuery, productId: candidate.productId, title: candidate.title, startedAt: Date.now(), status: "pending" }, () => details(candidate, query, nextPageToken), (result) => ({ resultCount: result.length }));
}

async function probeSerpApi() {
  const params = new URLSearchParams({ engine: "google", q: queries[0], gl: "br", hl: "pt-br", api_key: env.serpApi.apiKey });
  const startedAt = Date.now();
  const response = await nativeFetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(40_000) });
  const body = await response.json() as RawBody;
  return { status: response.status, durationMs: Date.now() - startedAt, error: body.error || null, organicResults: body.organic_results?.length || 0, immersiveProducts: body.immersive_products?.length || 0 };
}

async function auditQuery(message: string) {
  const startedAt = Date.now();
  const trace: Trace = { network: [], stages: [] };
  const provider = new SerpApiProductSearchProvider();
  traceProvider(provider, trace);
  const query = interpretShopperIntent(message, null);
  activeTrace = trace;
  try {
    const result = await discoverProducts(query, provider);
    const finishedAt = Date.now();
    const network = trace.network.map((call) => ({ ...call, counts: { ...call.counts }, elapsedAtSearchEndMs: (call.endedAt || finishedAt) - call.startedAt, excludedBecauseStillPending: call.status === "pending" }));
    const stages = trace.stages.map((call) => ({ ...call, elapsedAtSearchEndMs: (call.endedAt || finishedAt) - call.startedAt, excludedBecauseStillPending: call.status === "pending" }));
    const diagnostics = result.metrics.diagnostics;
    const searchRows = diagnostics.filter((row) => row.stage === "search");
    const detailOfferRows = diagnostics.filter((row) => row.stage === "details" && row.detailsFetched === true);
    const detailSkipped = diagnostics.filter((row) => row.stage === "details" && row.detailsFetched === false);
    const rejected = diagnostics.filter((row) => row.stage === "offer" && row.offerMatch === "FAIL" || row.stage === "ranking");
    const duplicates = diagnostics.filter((row) => row.stage === "deduplication");
    const immersiveCandidates = provider.googleDetailCandidates.map((candidate) => ({ productId: candidate.productId, title: candidate.title, relevance: candidate.relevance, sourcePosition: candidate.sourcePosition, detail: stages.find((call) => call.stage === "google_immersive_product" && call.productId === candidate.productId) || null }));
    return {
      query: message, interpretedQuery: query.query, maxPrice: query.maxPrice, totalMs: finishedAt - startedAt, error: null, pipelineCounts: result.metrics.stageCounts, pipelineTimings: result.metrics.timingsMs,
      counts: {
        shoppingResults: total(network, "shoppingResults"), inlineShoppingResults: total(network, "inlineShoppingResults"), categorizedShoppingResults: total(network, "categorizedShoppingResults"), organicResults: total(network, "organicResults"), immersiveProducts: total(network, "immersiveProducts"), productPricing: total(network, "productPricing"),
        rawCandidatesIncludingImmersive: total(network, "shoppingResults") + total(network, "inlineShoppingResults") + total(network, "categorizedShoppingResults") + total(network, "organicResults") + total(network, "immersiveProducts") + total(network, "productPricing"),
        parsedSearchCandidates: searchRows.length, immersiveCandidates: immersiveCandidates.length, offersExtractedFromDetails: detailOfferRows.length,
        detailRequestsStarted: stages.filter((call) => call.stage === "google_immersive_product").length,
        detailRequestsCompleted: stages.filter((call) => call.stage === "google_immersive_product" && call.status === "ok").length,
        storePageRequestsStarted: stages.filter((call) => call.stage === "google_immersive_store_page").length,
        storePageRequestsCompleted: stages.filter((call) => call.stage === "google_immersive_store_page" && call.status === "ok").length,
        detailCandidatesSkipped: detailSkipped.length,
        offersBeforeDeduplication: result.metrics.stageCounts.afterCompatibility,
        offersAfterDeduplication: result.metrics.stageCounts.afterDeduplication,
        rejectedBeforeRanking: diagnostics.filter((row) => row.stage === "offer" && row.offerMatch === "FAIL").length,
        rejectedAtRanking: diagnostics.filter((row) => row.stage === "ranking").length,
        duplicateOffers: duplicates.length,
        finalProducts: result.variations.length, finalOffers: result.results.length,
      },
      rejectionReasons: countBy(rejected, (row) => String(row.reason || "unknown")),
      stageTimings: stages,
      networkCalls: network,
      waitAndFallback: { shoppingWaitMs: result.metrics.shoppingWaitMs, sourcesExcludedByWait: result.metrics.sourcesExcludedByWait, exactSourceLifecycle: result.metrics.exactSourceLifecycle, pendingAtSearchEnd: stages.filter((call) => call.excludedBecauseStillPending), failedSearches: result.metrics.failedSearches, fallbackQueries: result.metrics.queries.slice(1), shoppingDiagnostics: result.metrics.sources.shopping },
      parser: provider.parseDiagnostics,
      immersiveCandidates,
      detailCandidatesSkipped: detailSkipped,
      duplicates,
      rejected,
      final: result.variations.map((variation) => ({ product: variation.title, offerCount: variation.offers.length, offers: variation.offers.map((offer) => ({ id: offer.id, productId: offer.productId, store: offer.store, title: offer.title, price: offer.price, url: offer.productUrl, provider: offer.provider, sourceQuery: offer.sourceQuery })) })),
      diagnostics,
    };
  } catch (error) {
    const finishedAt = Date.now();
    return { query: message, interpretedQuery: query.query, totalMs: finishedAt - startedAt, error: errorText(error), stageTimings: trace.stages.map((call) => ({ ...call, excludedBecauseStillPending: call.status === "pending" })), networkCalls: trace.network.map((call) => ({ ...call, excludedBecauseStillPending: call.status === "pending" })), sources: { google: provider.googleDiagnostics, shopping: provider.shoppingDiagnostics }, parser: provider.parseDiagnostics, immersiveCandidates: provider.googleDetailCandidates.map((item) => ({ productId: item.productId, title: item.title, relevance: item.relevance })) };
  } finally {
    activeTrace = null;
  }
}

const probe = process.argv.includes("--no-probe") ? null : await probeSerpApi();
if (probe && (probe.status !== 200 || probe.error)) {
  const error = `SerpAPI probe failed: HTTP ${probe.status} ${probe.error || ""}`.trim();
  await writeFile(outputPath, JSON.stringify({ probe, results: [], error }, null, 2));
  console.error(error);
  process.exit(2);
}

const results = [];
for (const message of queries) {
  const result = await auditQuery(message);
  results.push(result);
  console.log(JSON.stringify({ query: message, totalMs: result.totalMs, counts: "counts" in result ? result.counts : null, error: result.error }));
}
await writeFile(outputPath, JSON.stringify({ probe, results }, null, 2));
console.log(JSON.stringify({ wrote: outputPath, queries: results.length }));
