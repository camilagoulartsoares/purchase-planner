import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ExternalLink, Heart, LoaderCircle, Plus, RefreshCw, Search, Send, X } from "lucide-react";
import * as api from "../api/closet";
import { formatBRL, type ShopperCommercialFreshness, type ShopperConversation, type ShopperReply, type ShopperResult, type ShopperVariation } from "../types";
import { normalizeShopperMerchant } from "../utils/shopperMerchant";
import { formatVerifiedReview, orderShopperVariations, type ShopperSort } from "../utils/shopperSort";
import { formatOfferCheckedAt, formatShopperAge, sanitizeShopperUserError } from "../utils/shopperFreshness";

type Message = { role: "user" | "assistant"; content: string };
function OfferReview({ offer }: { offer: ShopperResult }) {
  const text = formatVerifiedReview(offer);
  return text ? <small className="shopper-review" title="Avaliação informada pela fonte deste anúncio">{text}</small> : null;
}

export function PersonalShopper() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [history, setHistory] = useState<ShopperConversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [all, setAll] = useState<ShopperVariation[]>([]);
  const [commercial, setCommercial] = useState<ShopperCommercialFreshness>();
  const [store, setStore] = useState("");
  const [sort, setSort] = useState<ShopperSort>("relevance");
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState<"prices" | "discovery" | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void api.fetchShopperConversations().then(setHistory).catch(() => undefined); }, []);
  const merchants = useMemo(() => [...new Set(all.flatMap((v) => v.offers.map((o) => o.merchant || normalizeShopperMerchant(o.store))))].sort((a, b) => a.localeCompare(b, "pt-BR")), [all]);
  const shown = useMemo(() => orderShopperVariations(all, store, sort), [all, store, sort]);
  const offers = shown.flatMap((v) => v.offers);
  const busy = loading || operation !== null;
  const load = (variations: ShopperVariation[]) => { setAll(variations); setStore(""); };
  const applyReply = (reply: ShopperReply) => {
    if ((reply.variations || []).length) load(reply.variations || []);
    setCommercial(reply.commercialFreshness);
    setMessages((current) => [...current, { role: "assistant", content: reply.answer }]);
  };

  useEffect(() => {
    if (open && !loading) console.info("[shopper.dom]", { expectedOffers: offers.length, renderedOffers: gridRef.current?.querySelectorAll(".shopper-offer").length || 0 });
  }, [open, loading, offers.length]);

  const openConversation = async (id: string) => {
    if (pending.current) return;
    pending.current = true; setConversationId(id); setMessages([]); load([]); setError(""); setLoading(true);
    try {
      const conversation = await api.fetchShopperConversation(id);
      setMessages(conversation.messages.map(({ role, content }) => ({ role, content })));
      load(conversation.variations || []); setCommercial(conversation.commercialFreshness);
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível abrir a conversa."); }
    finally { pending.current = false; setLoading(false); }
  };

  const send = async () => {
    if (!message.trim() || pending.current) return;
    pending.current = true; const text = message; setMessage(""); load([]); setLoading(true); setError(""); setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      const reply = await api.sendShopperMessage(text, conversationId);
      setConversationId(reply.conversationId); applyReply(reply);
      void api.fetchShopperConversations().then(setHistory).catch(() => undefined);
    } catch (error) { setMessage(text); setError(sanitizeShopperUserError(error instanceof Error ? error.message : "")); }
    finally { pending.current = false; setLoading(false); }
  };

  const runOperation = async (kind: "prices" | "discovery") => {
    if (!conversationId || pending.current) return;
    pending.current = true; setOperation(kind); setError("");
    try {
      const reply = kind === "prices" ? await api.refreshShopperPrices(conversationId) : await api.discoverShopperPromotions(conversationId);
      applyReply(reply);
    } catch { setError(kind === "prices" ? sanitizeShopperUserError(null, "refresh") : "Não foi possível verificar novas promoções agora. Os resultados anteriores foram mantidos."); }
    finally { pending.current = false; setOperation(null); }
  };

  const act = async (result: ShopperResult, action: "save" | "add-to-planner") => {
    if (!conversationId) return;
    try { await api.shopperAction(conversationId, result.id, action); }
    catch (error) { setError(error instanceof Error ? error.message : "Esse resultado expirou. Faça a pesquisa novamente."); }
  };

  const priceAge = formatShopperAge(commercial?.pricesCheckedAt);
  const discoveryAge = formatShopperAge(commercial?.fullDiscoveryAt);
  return <>
    <button type="button" className="shopper-popup-trigger" onClick={() => setOpen(true)}><Bot size={21}/><span>Personal Shopper IA</span></button>
    {open && <div className="shopper-popup-backdrop" onMouseDown={() => setOpen(false)}><div className="shopper-popup" onMouseDown={(event) => event.stopPropagation()}>
      <button className="shopper-popup-close" onClick={() => setOpen(false)}><X size={20}/></button>
      <section className="shopper-shell card-soft p-4 sm:p-5">
        <div className="shopper-heading"><div><p className="planner-kicker"><Bot size={15}/> Personal Shopper IA</p><h2 className="font-display mt-2 text-3xl font-semibold text-brown-deep">Encontre para mim</h2></div></div>
        {history.length ? <div className="shopper-history">{history.slice(0, 6).map((item) => <button type="button" className={conversationId === item.id ? "is-active" : ""} key={item.id} disabled={busy} onClick={() => void openConversation(item.id)}>{item.title || "Busca sem título"}</button>)}</div> : null}
        <div className="shopper-chat">{messages.map((item, index) => <p key={index} className={`shopper-message ${item.role}`}>{item.content}</p>)}{busy && <p className="shopper-message assistant"><LoaderCircle size={16} className="animate-spin"/> {operation === "prices" ? "Atualizando preços…" : operation === "discovery" ? "Buscando novas promoções…" : "Carregando…"}</p>}</div>
        <form className="shopper-form" onSubmit={(event) => { event.preventDefault(); void send(); }}><input value={message} disabled={busy} onChange={(event) => setMessage(event.target.value)} placeholder="Ex.: Quero uma bolsa elegante até R$ 200"/><button className="btn-primary" disabled={busy || !message.trim()}><Send size={16}/> Buscar</button></form>
        {loading && <div className="shopper-loading" role="status" aria-live="polite"><LoaderCircle size={24} className="animate-spin"/><span>Buscando as melhores ofertas...</span><div className="shopper-loading-cards" aria-hidden="true"><i/><i/><i/></div></div>}
        {error && <p className="finding-error mt-3">{error}</p>}
        {all.length ? <>
          <div className="shopper-results-head"><div><h3>Produtos e variações</h3><span>{shown.length} variações · {offers.length} ofertas</span></div><div className="shopper-update-actions"><button type="button" className="btn-ghost shopper-refresh" disabled={busy || !conversationId} onClick={() => void runOperation("prices")}><RefreshCw size={14} className={operation === "prices" ? "animate-spin" : ""}/> Atualizar preços</button><button type="button" className="btn-primary shopper-refresh" disabled={busy || !conversationId} onClick={() => void runOperation("discovery")}><Search size={14}/> Buscar novas promoções</button></div></div>
          <div className="shopper-commercial-freshness" aria-live="polite">{priceAge && <span>Preços verificados {priceAge}</span>}{discoveryAge && <span>Novas promoções pesquisadas {discoveryAge}</span>}{commercial?.memoryOnly && <small>Resultados carregados da memória para economizar consultas.</small>}</div>
          <div className="shopper-controls"><label className="shopper-store-select">Loja<select value={store} disabled={busy} onChange={(event) => setStore(event.target.value)}><option value="">Todas as lojas</option>{merchants.map((merchant) => <option key={merchant} value={merchant}>{merchant}</option>)}</select></label><label className="shopper-store-select">Ordenar por<select value={sort} disabled={busy} onChange={(event) => setSort(event.target.value as ShopperSort)}><option value="relevance">Relevância</option><option value="lowest_price">Menor preço</option><option value="highest_price">Maior preço</option><option value="best_rated">Mais bem avaliados</option><option value="most_reviews">Mais avaliações</option></select></label></div>
          <div className="shopper-grid" ref={gridRef}>{shown.map((variation) => <article className="shopper-card" key={variation.id}><div className="shopper-image">{variation.imageUrl ? <img src={variation.imageUrl} alt={variation.title}/> : <span>Imagem indisponível</span>}</div><div className="shopper-card-copy"><h4>{variation.title}</h4></div><div className="shopper-offers">{variation.offers.map((offer) => <div className={`shopper-offer${offer.priceStatus === "aged" ? " is-aged" : ""}`} key={offer.id}><div><b>{offer.store}</b><strong>{offer.price == null ? "Preço não informado" : formatBRL(offer.price)}</strong><OfferReview offer={offer}/>{formatOfferCheckedAt(offer.checkedAt) ? <small className="shopper-freshness">{formatOfferCheckedAt(offer.checkedAt)}</small> : null}</div><div className="shopper-actions"><a className="btn-ghost" href={offer.productUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Loja</a><button className="btn-ghost" disabled={busy} onClick={() => void act(offer, "save")}><Heart size={14}/> Salvar</button><button className="btn-primary" disabled={busy} onClick={() => void act(offer, "add-to-planner")}><Plus size={14}/> Planner</button></div></div>)}</div></article>)}</div>
        </> : null}
      </section>
    </div></div>}
  </>;
}
