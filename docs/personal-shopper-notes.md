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
