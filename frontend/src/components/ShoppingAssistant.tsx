import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, LoaderCircle, Send, Trash2 } from "lucide-react";
import * as api from "../api/closet";
import { formatBRL } from "../types";

type AssistantProduct = { id: string; name: string; category: string; brand: string; store: string; price: number; imageUrl: string | null };
type AssistantReply = { answer: string; recommendedProductIds: string[]; alternativeProductIds: string[]; total: number; remainingBudget: number | null; reasoningFactors: string[]; warnings: string[]; mode: "ai" | "local"; products: AssistantProduct[] };
type ChatMessage = { role: "user" | "assistant"; text: string; reply?: AssistantReply };

const suggestions = ["Tenho R$ 500. O que devo comprar primeiro?", "Monte um combo para academia até R$ 300.", "Quais favoritos cabem em R$ 400?", "Qual compra devo adiar?"];

export function ShoppingAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const send = async (text = message) => {
    const question = text.trim(); if (!question || loading) return;
    setMessage(""); setError(""); setLoading(true); setMessages((current) => [...current, { role: "user", text: question }]);
    try { const reply = await api.askShoppingAssistant(question); setMessages((current) => [...current, { role: "assistant", text: reply.answer, reply }]); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível consultar o assistente."); }
    finally { setLoading(false); }
  };
  return <section className="assistant-shell card-soft mb-6 p-4 sm:p-5">
    <div className="finding-section-head"><div><p className="planner-kicker"><Bot size={15} /> Assistente de compras</p><h2 className="font-display mt-2 text-3xl font-semibold text-brown-deep">O que eu compro?</h2><p className="mt-1 text-sm text-muted">Recomendações feitas somente com os produtos da sua lista.</p></div><button type="button" className="btn-ghost" onClick={() => { setMessages([]); setError(""); }} disabled={!messages.length}><Trash2 size={15} /> Limpar conversa</button></div>
    {!messages.length ? <div className="assistant-suggestions"><p>Experimente perguntar:</p>{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)}>{suggestion}</button>)}</div> : null}
    {messages.length ? <div className="assistant-history">{messages.map((item, index) => <div key={`${item.role}-${index}`} className={`assistant-message ${item.role}`}><p>{item.text}</p>{item.reply ? <AssistantResult reply={item.reply} /> : null}</div>)}{loading ? <div className="assistant-message assistant"><LoaderCircle size={18} className="animate-spin" /> Analisando a sua lista…</div> : null}</div> : null}
    {error ? <p className="finding-error mt-3">{error}</p> : null}
    <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); void send(); }}><input value={message} maxLength={700} onChange={(event) => setMessage(event.target.value)} placeholder="Ex.: Monte um combo até R$ 300" aria-label="Pergunta para o assistente" /><button className="btn-primary" disabled={!message.trim() || loading}><Send size={15} /> Enviar</button></form>
  </section>;
}

function AssistantResult({ reply }: { reply: AssistantReply }) {
  const recommended = new Set(reply.recommendedProductIds);
  return <div className="assistant-result">
    <small className="assistant-mode">{reply.mode === "local" ? "Análise local da sua lista" : "Análise com IA"}</small>
    {reply.total > 0 || reply.remainingBudget !== null ? <div className="assistant-totals"><span>Total {formatBRL(reply.total)}</span>{reply.remainingBudget !== null ? <span>Sobra {formatBRL(reply.remainingBudget)}</span> : null}</div> : null}
    {reply.reasoningFactors.length ? <p className="assistant-factors">{reply.reasoningFactors.join(" · ")}</p> : null}
    {reply.products.length ? <div className="assistant-product-list">{reply.products.map((product) => <Link key={product.id} to={`/produtos/${product.id}`} className={`assistant-product ${recommended.has(product.id) ? "recommended" : ""}`}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="assistant-product-image-empty" />}<span><b>{product.name}</b><small>{product.brand} · {product.category}</small></span><strong>{formatBRL(product.price)}</strong></Link>)}</div> : null}
    {reply.warnings.map((warning) => <p key={warning} className="assistant-warning">{warning}</p>)}
  </div>;
}
