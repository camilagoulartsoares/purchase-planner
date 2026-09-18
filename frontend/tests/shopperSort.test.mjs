import assert from "node:assert/strict";
import { test } from "node:test";
import { formatVerifiedReview, orderShopperVariations, verifiedReview } from "../src/utils/shopperSort.ts";

function offer(id, store, price, rating = null, reviewCount = null) {
  return { id, store, merchant: store, price, rating, reviewCount };
}

function variation(id, offers) {
  return { id, title: id, imageUrl: null, offers };
}

test("relevance preserves the exact original variation and offer order", () => {
  const original = [variation("first", [offer("b", "Loja", 300), offer("a", "Loja", 100)]), variation("second", [offer("c", "Loja", 200)])];
  assert.equal(orderShopperVariations(original, "", "relevance"), original);
  assert.deepEqual(orderShopperVariations(original, "", "relevance").map((item) => item.id), ["first", "second"]);
  assert.deepEqual(original[0].offers.map((item) => item.id), ["b", "a"]);
});

test("lowest and highest price consider all offers in each variation without removing any", () => {
  const products = [variation("multi", [offer("high", "A", 500), offer("low", "B", 90)]), variation("middle", [offer("mid", "C", 600)]), variation("unknown", [offer("none", "D", null)])];
  const low = orderShopperVariations(products, "", "lowest_price");
  const high = orderShopperVariations(products, "", "highest_price");
  assert.deepEqual(low.map((item) => item.id), ["multi", "middle", "unknown"]);
  assert.deepEqual(high.map((item) => item.id), ["middle", "multi", "unknown"]);
  assert.deepEqual(low[0].offers.map((item) => item.id), ["low", "high"]);
  assert.deepEqual(high[1].offers.map((item) => item.id), ["high", "low"]);
  assert.equal(low.flatMap((item) => item.offers).length, 4);
  assert.deepEqual(products[0].offers.map((item) => item.id), ["high", "low"]);
});

test("best rated balances rating and review volume and keeps unrated products", () => {
  const products = [variation("five-two", [offer("a", "A", 100, 5, 2)]), variation("trusted", [offer("b", "B", 200, 4.8, 3542)]), variation("unrated", [offer("c", "C", 90)])];
  assert.deepEqual(orderShopperVariations(products, "", "best_rated").map((item) => item.id), ["trusted", "five-two", "unrated"]);
});

test("most reviews uses one offer count, never a sum across stores", () => {
  const products = [variation("two-stores", [offer("a", "A", 100, 4.8, 100), offer("b", "B", 105, 4.7, 100)]), variation("one-store", [offer("c", "C", 120, 4.5, 150)]), variation("unrated", [offer("d", "D", 99)])];
  assert.deepEqual(orderShopperVariations(products, "", "most_reviews").map((item) => item.id), ["one-store", "two-stores", "unrated"]);
});

test("store selection and ordering combine using only visible offers", () => {
  const products = [variation("mixed", [offer("a", "A", 500, 5, 2), offer("b", "B", 80, 4.8, 3000)]), variation("store-a", [offer("c", "A", 200, 4.8, 4000)]), variation("store-b", [offer("d", "B", 100, 4.7, 500)])];
  assert.deepEqual(orderShopperVariations(products, "A", "lowest_price").map((item) => item.id), ["store-a", "mixed"]);
  assert.deepEqual(orderShopperVariations(products, "B", "best_rated").map((item) => item.id), ["mixed", "store-b"]);
  assert.deepEqual(orderShopperVariations(products, "B", "most_reviews").map((item) => item.id), ["mixed", "store-b"]);
  assert.deepEqual(orderShopperVariations(products, "A", "relevance").map((item) => item.id), ["mixed", "store-a"]);
  assert.equal(orderShopperVariations(products, "A", "lowest_price").flatMap((item) => item.offers).length, 2);
});

test("shows only a verified offer-specific rating and formats Brazilian numbers", () => {
  assert.deepEqual(verifiedReview(offer("ok", "A", 100, 4.8, 3542)), { rating: 4.8, count: 3542 });
  assert.equal(formatVerifiedReview(offer("ok", "A", 100, 4.8, 3542)), "⭐ 4,8 (3.542 avaliações)");
  for (const [rating, count] of [[null, 40], [5, null], [6, 40], [4.8, -1], [4.8, 2.5], [Infinity, 20]]) {
    assert.equal(formatVerifiedReview(offer("invalid", "A", 100, rating, count)), null);
  }
});
