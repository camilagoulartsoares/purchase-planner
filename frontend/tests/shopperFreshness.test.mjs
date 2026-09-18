import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOfferCheckedAt, sanitizeShopperUserError } from "../src/utils/shopperFreshness.ts";

test("formats verification time in human language without cache jargon", () => {
  const now = new Date("2026-09-18T18:00:00");
  assert.equal(formatOfferCheckedAt("2026-09-18T14:32:00", now), "Verificado hoje às 14:32");
  assert.equal(formatOfferCheckedAt("2026-09-17T10:00:00", now), "Verificado ontem");
  assert.equal(formatOfferCheckedAt("2026-09-15T10:00:00", now), "Preço verificado há 3 dias");
  assert.match(formatOfferCheckedAt("2026-09-01T10:00:00", now) || "", /Preço verificado em /);
});

test("hides technical provider errors from the shopper user", () => {
  assert.equal(sanitizeShopperUserError("SerpAPI quota HTTP 429"), "Não foi possível buscar novas ofertas agora. Tente novamente mais tarde.");
  assert.equal(sanitizeShopperUserError("Configure SERPAPI_API_KEY no backend."), "Não foi possível buscar novas ofertas agora. Tente novamente mais tarde.");
  assert.equal(sanitizeShopperUserError(null, "refresh"), "Não foi possível atualizar os preços agora.");
});
