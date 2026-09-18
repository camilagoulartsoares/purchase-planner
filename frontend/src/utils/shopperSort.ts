import type { ShopperResult, ShopperVariation } from "../types.ts";
import { normalizeShopperMerchant } from "./shopperMerchant.ts";

export type ShopperSort = "relevance" | "lowest_price" | "highest_price" | "best_rated" | "most_reviews";

function price(offer: ShopperResult): number | null {
  return typeof offer.price === "number" && Number.isFinite(offer.price) && offer.price >= 0 ? offer.price : null;
}

function reviewCount(offer: ShopperResult): number | null {
  return typeof offer.reviewCount === "number" && Number.isSafeInteger(offer.reviewCount) && offer.reviewCount > 0 ? offer.reviewCount : null;
}

export function verifiedReview(offer: ShopperResult): { rating: number; count: number } | null {
  const count = reviewCount(offer);
  return typeof offer.rating === "number" && Number.isFinite(offer.rating) && offer.rating >= 1 && offer.rating <= 5 && count != null
    ? { rating: offer.rating, count } : null;
}

export function formatVerifiedReview(offer: ShopperResult): string | null {
  const review = verifiedReview(offer);
  if (!review) return null;
  const rating = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(review.rating);
  const count = new Intl.NumberFormat("pt-BR").format(review.count);
  return `⭐ ${rating} (${count} ${review.count === 1 ? "avaliação" : "avaliações"})`;
}

// Shrink small samples toward a neutral score so a handful of five-star
// reviews cannot outrank a well-established, nearly five-star offer by default.
function adjustedRating(offer: ShopperResult): number | null {
  const review = verifiedReview(offer);
  return review ? (review.rating * review.count + 3.5 * 50) / (review.count + 50) : null;
}

function variationPrice(variation: ShopperVariation, highest: boolean): number | null {
  const prices = variation.offers.map(price).filter((value): value is number => value != null);
  return prices.length ? (highest ? Math.max(...prices) : Math.min(...prices)) : null;
}

function variationRating(variation: ShopperVariation): number | null {
  const ratings = variation.offers.map(adjustedRating).filter((value): value is number => value != null);
  return ratings.length ? Math.max(...ratings) : null;
}

function variationReviews(variation: ShopperVariation): number | null {
  const counts = variation.offers.map(reviewCount).filter((value): value is number => value != null);
  return counts.length ? Math.max(...counts) : null;
}

export function orderShopperVariations(variations: ShopperVariation[], store: string, sort: ShopperSort): ShopperVariation[] {
  const selected = store ? variations.flatMap((variation) => {
    const offers = variation.offers.filter((offer) => (offer.merchant || normalizeShopperMerchant(offer.store)) === store);
    return offers.length ? [{ ...variation, offers, imageUrl: offers.find((offer) => offer.imageUrl)?.imageUrl || variation.imageUrl }] : [];
  }) : variations;
  if (sort === "relevance") return selected;

  const highest = sort === "highest_price";
  const scored = selected.map((variation, index) => {
    const offers = sort === "lowest_price" || highest
      ? [...variation.offers].sort((a, b) => {
        const left = price(a);
        const right = price(b);
        if (left == null) return right == null ? 0 : 1;
        if (right == null) return -1;
        return highest ? right - left : left - right;
      }) : variation.offers;
    const visible = offers === variation.offers ? variation : { ...variation, offers };
    const value = sort === "lowest_price" || highest ? variationPrice(visible, highest)
      : sort === "best_rated" ? variationRating(visible) : variationReviews(visible);
    return { variation: visible, index, value };
  });
  scored.sort((a, b) => {
    if (a.value == null) return b.value == null ? a.index - b.index : 1;
    if (b.value == null) return -1;
    const difference = sort === "lowest_price" ? a.value - b.value : b.value - a.value;
    return difference || a.index - b.index;
  });
  return scored.map((entry) => entry.variation);
}
