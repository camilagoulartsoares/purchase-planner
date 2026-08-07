import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ExternalLink, Heart, LoaderCircle, Plus, Send, SlidersHorizontal, Star } from "lucide-react";
import * as api from "../api/closet";
import { formatBRL, type ShopperConversation, type ShopperResult } from "../types";

type Message = { role: "user" | "assistant"; content: string };
const starters = ["Quero um Crocs até R$ 70", "Bolsa preta para trabalhar até R$ 150", "Tênis clean para academia, tamanho 37, até R$ 250"];

export function PersonalShopper() {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [history, setHistory] = useState<ShopperConversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [results, setResults] = useState<ShopperResult[]>([]);
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
      setConversationId(reply.conversationId); setResults(reply.results);
      setMessages((old) => [...old, { role: "assistant", content: reply.answer }]);
      await refreshHistory();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível consultar as lojas agora."); }
    finally { setLoading(false); setStage(""); }
  };

  const openHistory = async (id: string) => {
    try { const data = await api.fetchShopperConversation(id); setConversationId(id); setMessages(data.messages.map((item) => ({ role: item.role, content: item.content }))); setResults(data.searches[0]?.results || []); setNotice("Conversa reaberta."); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível abrir a conversa."); }
  };

  const act = async (result: ShopperResult, action: "save" | "add-to-planner") => {
    if (!conversationId) return;
    try { const response = await api.shopperAction(conversationId, result.id, action); setNotice(response.action === "save" ? "Produto salvo em Meus achados." : "Produto adicionado ao Planner."); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível concluir a ação."); }
  };
  const toggleComparison = (id: string) => setComparison((old) => old.includes(id) ? old.filter((item) => item !== id) : old.length < 3 ? [...old, id] : old);

  return <section className="shopper-shell card-soft mb-6 p-4 sm:p-5">
    <div className="shopper-heading"><div><p className="planner-kicker"><Bot size={15} /> Personal Shopper IA</p><h2 className="font-display mt-2 text-3xl font-semibold text-brown-deep">Encontre para mim</h2><p className="mt-1 text-sm text-muted">Conte o que procura. Eu interpreto o pedido e consulto opções reais nas lojas.</p></div><button type="button" className="btn-ghost" onClick={() => { setConversationId(undefined); setMessages([]); setResults([]); setComparison([]); setNotice(""); }}>Nova conversa</button></div>
    {history.length ? <div className="shopper-history" aria-label="Conversas recentes">{history.slice(0, 6).map((item) => <button key={item.id} type="button" onClick={() => void openHistory(item.id)} className={item.id === conversationId ? "is-active" : ""}>{item.title || "Busca sem título"}</button>)}</div> : null}
    <div className="shopper-chat" aria-live="polite">{messages.map((item, index) => <p key={`${item.role}-${index}`} className={`shopper-message ${item.role}`}>{item.content}</p>)}{loading ? <p className="shopper-message assistant"><LoaderCircle size={16} className="animate-spin" /> {stage}</p> : null}</div>
    {!messages.length ? <div className="shopper-starters">{starters.map((item) => <button key={item} type="button" onClick={() => void send(item)}>{item}</button>)}</div> : null}
    <form className="shopper-form" onSubmit={(event) => { event.preventDefault(); void send(); }}><input value={message} maxLength={700} onChange={(event) => setMessage(event.target.value)} placeholder="Ex.: Quero uma bolsa elegante para trabalhar até R$ 200" aria-label="O que você quer encontrar" /><button className="btn-primary" disabled={loading || !message.trim()}><Send size={16} /> Buscar</button></form>
    {error ? <p className="finding-error mt-3">{error}</p> : null}{notice ? <p className="shopper-notice" role="status"><Check size={15} /> {notice}</p> : null}
    {results.length ? <><div className="shopper-results-head"><div><h3>Opções encontradas</h3><p>Produtos e preços vêm da fonte consultada agora.</p></div><span>{results.length} resultados</span></div><div className="shopper-grid">{results.map((result, index) => <article className="shopper-card" key={result.id}><div className="shopper-image">{result.imageUrl ? <img src={result.imageUrl} alt={result.title} onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span>Imagem indisponível</span>}{result.discountPercent ? <b>{result.discountPercent}% OFF</b> : null}</div><div className="shopper-card-copy"><small>{result.store || "Loja não informada"}</small><h4>{result.title}</h4>{result.previousPrice && result.price != null ? <del>{formatBRL(result.previousPrice)}</del> : null}<strong>{result.price == null ? "Preço não informado" : formatBRL(result.price)}</strong>{result.rating != null ? <span><Star size={13} fill="currentColor" /> {result.rating.toLocaleString("pt-BR")}{result.reviewCount != null ? ` (${result.reviewCount})` : ""}</span> : null}{result.shipping ? <em>{result.shipping}</em> : null}<p><b>{index === 0 ? "Melhor aderência" : "Por que entrou"}</b> {result.reason}</p><div className="shopper-score"><span>Pedido {result.match.query}</span><span>Orçamento {result.match.budget}</span><span>Dados {result.match.completeness}</span></div></div><div className="shopper-actions"><a className="btn-ghost" href={result.productUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Ver produto</a><button type="button" className="btn-ghost" onClick={() => void act(result, "save")}><Heart size={14} /> Salvar</button><button type="button" className="btn-primary" disabled={result.price == null} onClick={() => void act(result, "add-to-planner")}><Plus size={14} /> Planner</button><button type="button" className={`btn-ghost ${comparison.includes(result.id) ? "is-selected" : ""}`} onClick={() => toggleComparison(result.id)}><SlidersHorizontal size={14} /> Comparar</button></div></article>)}</div></> : null}
    {selected.length >= 2 ? <div className="shopper-compare"><div><p className="planner-kicker">Comparação</p><h3>Qual vale mais a pena?</h3></div><div className="shopper-compare-grid">{selected.map((item) => <article key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}<b>{item.title}</b><span>{item.price == null ? "Preço não informado" : formatBRL(item.price)}</span><small>{item.store || "Loja não informada"}</small><small>Aderência: {item.match.total}/100</small></article>)}</div></div> : null}
  </section>;
}
