import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ExternalLink, Heart, LoaderCircle, Plus, Send, SlidersHorizontal, X } from "lucide-react";
import * as api from "../api/closet";
import { formatBRL, type ShopperConversation, type ShopperResult, type ShopperVariation } from "../types";

type Message = { role: "user" | "assistant"; content: string };
const starters = ["Quero um Crocs até R$ 70", "Bolsa preta para trabalhar até R$ 150", "Tênis clean para academia, tamanho 37, até R$ 250"];

export function PersonalShopper() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [history, setHistory] = useState<ShopperConversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [results, setResults] = useState<ShopperResult[]>([]);
  const [variations, setVariations] = useState<ShopperVariation[]>([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [comparison, setComparison] = useState<string[]>([]);

  const selected = useMemo(() => results.filter((item) => comparison.includes(item.id)), [results, comparison]);
  const refreshHistory = () => api.fetchShopperConversations().then(setHistory).catch(() => undefined);
  useEffect(() => { void refreshHistory(); }, []);

  const send = async (value = message) => {
    const text = value.trim(); if (!text || loading) return;
    setMessage(""); setError(""); setNotice(""); setLoading(true); setStage("Entendendo o que você procura…");
    setMessages((old) => [...old, { role: "user", content: text }]);
    try {
      window.setTimeout(() => setStage("Buscando opções reais…"), 350);
      const reply = await api.sendShopperMessage(text, conversationId);
      setStage("Selecionando os melhores resultados…");
      setConversationId(reply.conversationId); setResults(reply.results); setVariations(reply.variations || []); setVisibleCount(12); setExpanded([]); setComparison([]);
      setMessages((old) => [...old, { role: "assistant", content: reply.answer }]);
      await refreshHistory();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível consultar as lojas agora."); }
    finally { setLoading(false); setStage(""); }
  };

  const openHistory = async (id: string) => {
    try { const data = await api.fetchShopperConversation(id); setConversationId(id); setMessages(data.messages.map((item) => ({ role: item.role, content: item.content }))); setResults(data.searches[0]?.results || []); setVariations(data.variations || []); setVisibleCount(12); setExpanded([]); setComparison([]); setNotice("Conversa reaberta."); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível abrir a conversa."); }
  };

  const act = async (result: ShopperResult, action: "save" | "add-to-planner") => {
    if (!conversationId) return;
    try { const response = await api.shopperAction(conversationId, result.id, action); setNotice(response.action === "save" ? "Produto salvo em Meus achados." : "Produto adicionado ao Planner."); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível concluir a ação."); }
  };
  const toggleComparison = (id: string) => setComparison((old) => old.includes(id) ? old.filter((item) => item !== id) : old.length < 3 ? [...old, id] : old);

  return <><button type="button" className="shopper-popup-trigger" onClick={() => setOpen(true)} aria-label="Abrir Personal Shopper IA"><Bot size={21} /><span>Personal Shopper IA</span></button>{open ? <div className="shopper-popup-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><div className="shopper-popup" role="dialog" aria-modal="true" aria-labelledby="personal-shopper-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="shopper-popup-close" onClick={() => setOpen(false)} aria-label="Fechar Personal Shopper IA" title="Fechar"><X size={20} /></button><section className="shopper-shell card-soft p-4 sm:p-5">
    <div className="shopper-heading"><div><p className="planner-kicker"><Bot size={15} /> Personal Shopper IA</p><h2 id="personal-shopper-title" className="font-display mt-2 text-3xl font-semibold text-brown-deep">Encontre para mim</h2><p className="mt-1 text-sm text-muted">Conte o que procura. Eu interpreto o pedido e consulto opções reais nas lojas.</p></div><button type="button" className="btn-ghost" onClick={() => { setConversationId(undefined); setMessages([]); setResults([]); setVariations([]); setComparison([]); setNotice(""); }}>Nova conversa</button></div>
    {history.length ? <div className="shopper-history" aria-label="Conversas recentes">{history.slice(0, 6).map((item) => <button key={item.id} type="button" onClick={() => void openHistory(item.id)} className={item.id === conversationId ? "is-active" : ""}>{item.title || "Busca sem título"}</button>)}</div> : null}
    <div className="shopper-chat" aria-live="polite">{messages.map((item, index) => <p key={`${item.role}-${index}`} className={`shopper-message ${item.role}`}>{item.content}</p>)}{loading ? <p className="shopper-message assistant"><LoaderCircle size={16} className="animate-spin" /> {stage}</p> : null}</div>
    {!messages.length ? <div className="shopper-starters">{starters.map((item) => <button key={item} type="button" onClick={() => void send(item)}>{item}</button>)}</div> : null}
    <form className="shopper-form" onSubmit={(event) => { event.preventDefault(); void send(); }}><input value={message} maxLength={700} onChange={(event) => setMessage(event.target.value)} placeholder="Ex.: Quero uma bolsa elegante para trabalhar até R$ 200" aria-label="O que você quer encontrar" /><button className="btn-primary" disabled={loading || !message.trim()}><Send size={16} /> Buscar</button></form>
    {error ? <p className="finding-error mt-3">{error}</p> : null}{notice ? <p className="shopper-notice" role="status"><Check size={15} /> {notice}</p> : null}
    {variations.length ? <><div className="shopper-results-head"><div><h3>Produtos e variações</h3><p>Confira a composição antes de comparar ofertas.</p></div><span>{variations.length} variações · {results.length} ofertas</span></div><div className="shopper-grid">{variations.slice(0, visibleCount).map((variation) => <article className="shopper-card" key={variation.id}><div className="shopper-image">{variation.imageUrl ? <img src={variation.imageUrl} alt={variation.title} onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span>Imagem indisponível</span>}</div><div className="shopper-card-copy"><small>{variation.offers.length} oferta{variation.offers.length === 1 ? "" : "s"}</small><h4>{variation.title}</h4><strong>{variation.offers.find((offer) => offer.price != null)?.price != null ? `A partir de ${formatBRL(variation.offers.find((offer) => offer.price != null)!.price!)}` : "Preço não informado"}</strong></div><div className="shopper-offers">{(expanded.includes(variation.id) ? variation.offers : variation.offers.slice(0, 3)).map((offer) => <div className="shopper-offer" key={offer.id}><div><b>{offer.store || "Loja não informada"}</b>{offer.title !== variation.title ? <small>{offer.title}</small> : null}{offer.previousPrice != null && offer.price != null && offer.previousPrice > offer.price ? <del>{formatBRL(offer.previousPrice)}</del> : null}<strong>{offer.price == null ? "Preço não informado" : formatBRL(offer.price)}</strong>{offer.shipping ? <em>{offer.shipping}</em> : null}</div><div className="shopper-actions"><a className="btn-ghost" href={offer.productUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Loja</a><button type="button" className="btn-ghost" onClick={() => void act(offer, "save")}><Heart size={14} /> Salvar</button><button type="button" className="btn-primary" disabled={offer.price == null} onClick={() => void act(offer, "add-to-planner")}><Plus size={14} /> Planner</button><button type="button" className={`btn-ghost ${comparison.includes(offer.id) ? "is-selected" : ""}`} onClick={() => toggleComparison(offer.id)}><SlidersHorizontal size={14} /> Comparar</button></div></div>)}</div>{variation.offers.length > 3 ? <button type="button" className="btn-ghost" onClick={() => setExpanded((old) => old.includes(variation.id) ? old.filter((id) => id !== variation.id) : [...old, variation.id])}>{expanded.includes(variation.id) ? "Mostrar menos" : `Ver mais ${variation.offers.length - 3} ofertas`}</button> : null}</article>)}</div>{visibleCount < variations.length ? <button type="button" className="btn-ghost" onClick={() => setVisibleCount((count) => count + 12)}>Ver mais produtos</button> : null}</> : null}    {selected.length >= 2 ? <div className="shopper-compare"><div><p className="planner-kicker">Comparação</p><h3>Qual vale mais a pena?</h3></div><div className="shopper-compare-grid">{selected.map((item) => <article key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}<b>{item.title}</b><span>{item.price == null ? "Preço não informado" : formatBRL(item.price)}</span><small>{item.store || "Loja não informada"}</small><small>Aderência: {item.match.total}/100</small></article>)}</div></div> : null}
  </section></div></div> : null}</>;
}
