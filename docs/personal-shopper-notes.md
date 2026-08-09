# Personal Shopper notes

The Google Shopping provider returns only source-backed commercial fields.
Store, price, image, shipping and rating stay hidden when the provider does not send them.
A request using 'ate R$' is treated as a strict maximum price.
Budget filtering happens after the provider response to avoid empty Brazil-specific Google Shopping queries.
Follow-up preferences such as color keep the active conversation budget and product intent.
Conversation context and normalized result snapshots are persisted for reopening a search.
A result can be saved to Meus achados while retaining its provider and discovery date.
A priced external result can be added directly to the Planner as a WANT item.
The interface supports selecting up to three returned products for side-by-side comparison.
Slow provider responses receive a friendly unavailable-source response instead of an internal error.
Google Shopping may include Mercado Livre, Shopee and other stores in the same result set.
New direct marketplace integrations can implement ProductSearchProvider without changing the chat.
The intent model interprets a request but never creates product, store, price or URL data.
Product cards expose the source URL in a separate new-tab action.
Production uses the Render backend and the Vercel frontend with the public API URL embedded at build time.
Promotion cards are based on confirmed current campaigns instead of a fixed catalog.
An expired campaign is omitted by the next promotion scan and cannot remain marked as a discount.
A saved product link also creates a Planner item so it can be organized with existing products.
The link review form uses the existing category list to choose a clothing type before saving.
Planner items created from a link retain the original store URL for later shopping.
On small screens, finding card actions wrap below the product content for readable controls.
The link review modal uses the device viewport height and its content scrolls internally on mobile.
