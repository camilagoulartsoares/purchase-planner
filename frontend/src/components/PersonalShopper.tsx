import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ExternalLink, Heart, LoaderCircle, Plus, RefreshCw, Send, X } from "lucide-react";
import * as api from "../api/closet";
import { formatBRL, type ShopperConversation, type ShopperResult, type ShopperVariation } from "../types";
import { normalizeShopperMerchant } from "../utils/shopperMerchant";
import { formatVerifiedReview, orderShopperVariations, type ShopperSort } from "../utils/shopperSort";
import { formatOfferCheckedAt, sanitizeShopperUserError } from "../utils/shopperFreshness";
type Message = { role: "user" | "assistant"; content: string };
function OfferReview({ offer }: { offer: ShopperResult }) {
  const text = formatVerifiedReview(offer);
  return text ? <small className="shopper-review" title="Avaliação informada pela fonte deste anúncio">{text}</small> : null;
}
export function PersonalShopper() {
  const [open,setOpen]=useState(false),[message,setMessage]=useState(""),[conversationId,setConversationId]=useState<string>(),[history,setHistory]=useState<ShopperConversation[]>([]),[messages,setMessages]=useState<Message[]>([]),[all,setAll]=useState<ShopperVariation[]>([]),[store,setStore]=useState(""),[sort,setSort]=useState<ShopperSort>("relevance"),[loading,setLoading]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState("");
  const pending=useRef(false);
  const gridRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{void api.fetchShopperConversations().then(setHistory).catch(()=>undefined);},[]);
  const merchants=useMemo(()=>[...new Set(all.flatMap(v=>v.offers.map(o=>o.merchant||normalizeShopperMerchant(o.store))))].sort((a,b)=>a.localeCompare(b,"pt-BR")),[all]);
  const shown=useMemo(()=>orderShopperVariations(all,store,sort),[all,store,sort]);
  useEffect(()=>{if(open&&!loading)console.info("[shopper.dom]",{expectedOffers:shown.reduce((count,variation)=>count+variation.offers.length,0),renderedOffers:gridRef.current?.querySelectorAll(".shopper-offer").length||0});},[open,loading,shown]);
  const offers=shown.flatMap(v=>v.offers);
  const load=(variations:ShopperVariation[])=>{setAll(variations);setStore("");};
  const openConversation=async(id:string)=>{if(pending.current)return;pending.current=true;setConversationId(id);setMessages([]);load([]);setError("");setLoading(true);try{const conversation=await api.fetchShopperConversation(id);setMessages(conversation.messages.map(({role,content})=>({role,content})));load(conversation.variations||[]);}catch(e){setError(e instanceof Error?e.message:"Não foi possível abrir a conversa.");}finally{pending.current=false;setLoading(false);}};
  const send=async()=>{
    if(!message.trim()||pending.current)return;
    pending.current=true;
    const text=message;
    setMessage("");load([]);setLoading(true);setError("");
    setMessages(x=>[...x,{role:"user",content:text}]);
    try{
      const r=await api.sendShopperMessage(text,conversationId);
      const apiOffers=r.results?.length||0;
      const renderedOffers=(r.variations||[]).reduce((count,variation)=>count+variation.offers.length,0);
      console.info("[shopper.ui]",{apiOffers,renderedOffers,variationCount:r.variations?.length||0});
      setConversationId(r.conversationId);load(r.variations||[]);
      setMessages(x=>[...x,{role:"assistant",content:r.answer}]);
      void api.fetchShopperConversations().then(setHistory).catch(()=>undefined);
    }catch(e){setMessage(text);setError(sanitizeShopperUserError(e instanceof Error?e.message:""));}
    finally{pending.current=false;setLoading(false);}
  };
  const busy=loading||refreshing;
  const act=async(result:ShopperResult,action:"save"|"add-to-planner")=>{if(!conversationId)return;try{await api.shopperAction(conversationId,result.id,action);}catch(e){setError(e instanceof Error?e.message:"Esse resultado expirou. Faça a pesquisa novamente.");}};
  const refresh=async()=>{if(!conversationId||pending.current)return;pending.current=true;setRefreshing(true);setError("");try{const r=await api.refreshShopperPrices(conversationId);if((r.variations||[]).length)load(r.variations||[]);setMessages(x=>[...x,{role:"assistant",content:r.answer}]);}catch{setError(sanitizeShopperUserError(null,"refresh"));}finally{pending.current=false;setRefreshing(false);}};
  return <><button type="button" className="shopper-popup-trigger" onClick={()=>setOpen(true)}><Bot size={21}/><span>Personal Shopper IA</span></button>{open&&<div className="shopper-popup-backdrop" onMouseDown={()=>setOpen(false)}><div className="shopper-popup" onMouseDown={e=>e.stopPropagation()}><button className="shopper-popup-close" onClick={()=>setOpen(false)}><X size={20}/></button><section className="shopper-shell card-soft p-4 sm:p-5"><div className="shopper-heading"><div><p className="planner-kicker"><Bot size={15}/> Personal Shopper IA</p><h2 className="font-display mt-2 text-3xl font-semibold text-brown-deep">Encontre para mim</h2></div></div>{history.length?<div className="shopper-history">{history.slice(0,6).map(x=><button type="button" className={conversationId===x.id?"is-active":""} key={x.id} disabled={busy} onClick={()=>void openConversation(x.id)}>{x.title||"Busca sem título"}</button>)}</div>:null}<div className="shopper-chat">{messages.map((x,i)=><p key={i} className={`shopper-message ${x.role}`}>{x.content}</p>)}{busy&&<p className="shopper-message assistant"><LoaderCircle size={16} className="animate-spin"/> {refreshing?"Atualizando preços…":"Carregando…"}</p>}</div><form className="shopper-form" onSubmit={e=>{e.preventDefault();void send();}}><input value={message} disabled={busy} onChange={e=>setMessage(e.target.value)} placeholder="Ex.: Quero uma bolsa elegante até R$ 200"/><button className="btn-primary" disabled={busy||!message.trim()}><Send size={16}/> Buscar</button></form>{loading&&<div className="shopper-loading" role="status" aria-live="polite"><LoaderCircle size={24} className="animate-spin"/><span>Buscando as melhores ofertas...</span><div className="shopper-loading-cards" aria-hidden="true"><i/><i/><i/></div></div>}{error&&<p className="finding-error mt-3">{error}</p>}{all.length?<><div className="shopper-results-head"><div><h3>Produtos e variações</h3><span>{shown.length} variações · {offers.length} ofertas</span></div><button type="button" className="btn-ghost shopper-refresh" disabled={busy||!conversationId} onClick={()=>void refresh()}><RefreshCw size={14} className={refreshing?"animate-spin":""}/> Atualizar preços</button></div><div className="shopper-controls"><label className="shopper-store-select">Loja<select value={store} disabled={busy} onChange={e=>setStore(e.target.value)}><option value="">Todas as lojas</option>{merchants.map(x=><option key={x} value={x}>{x}</option>)}</select></label><label className="shopper-store-select">Ordenar por<select value={sort} disabled={busy} onChange={e=>setSort(e.target.value as ShopperSort)}><option value="relevance">Relevância</option><option value="lowest_price">Menor preço</option><option value="highest_price">Maior preço</option><option value="best_rated">Mais bem avaliados</option><option value="most_reviews">Mais avaliações</option></select></label></div><div className="shopper-grid" ref={gridRef}>{shown.map(v=><article className="shopper-card" key={v.id}><div className="shopper-image">{v.imageUrl?<img src={v.imageUrl} alt={v.title}/>:<span>Imagem indisponível</span>}</div><div className="shopper-card-copy"><h4>{v.title}</h4></div><div className="shopper-offers">{v.offers.map(o=><div className={`shopper-offer${o.priceStatus==="aged"?" is-aged":""}`} key={o.id}><div><b>{o.store}</b><strong>{o.price==null?"Preço não informado":formatBRL(o.price)}</strong><OfferReview offer={o}/>{formatOfferCheckedAt(o.checkedAt)?<small className="shopper-freshness">{formatOfferCheckedAt(o.checkedAt)}</small>:null}</div><div className="shopper-actions"><a className="btn-ghost" href={o.productUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Loja</a><button className="btn-ghost" disabled={busy} onClick={()=>void act(o,"save")}><Heart size={14}/> Salvar</button><button className="btn-primary" disabled={busy} onClick={()=>void act(o,"add-to-planner")}><Plus size={14}/> Planner</button></div></div>)}</div></article>)}</div></>:null}</section></div></div>}</>;
}
