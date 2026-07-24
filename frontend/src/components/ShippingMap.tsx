import { useEffect, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import * as api from "../api/closet";
import { formatBRL, type ShippingMap as ShippingMapData } from "../types";

export function ShippingMap() {
  const [data, setData] = useState<ShippingMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await api.fetchShippingMap()); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar o mapa de frete."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const refresh = async () => {
    setLoading(true); setError("");
    try { setData(await api.refreshShippingMap()); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível atualizar a comparação."); }
    finally { setLoading(false); }
  };
  const saveLink = async (id: string) => {
    const url = links[id]; if (!url) return;
    try { await api.updateShippingMapLink(id, url); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o link."); }
  };

  return <section className="card-soft mb-6 p-4">
    <div className="finding-section-head"><div>
      <p className="planner-kicker"><MapPin size={15} /> Mapa de frete</p>
      <h2 className="font-display mt-2 text-3xl font-semibold text-brown-deep">Total para o CEP 37500-224</h2>
      <p className="mt-1 text-sm text-muted">Preço + frete − desconto, da opção mais barata para a mais cara.</p>
    </div><button className="btn-primary" type="button" disabled={loading} onClick={() => void refresh()}>
      <RefreshCw size={15} /> {loading ? "Atualizando..." : "Atualizar comparação"}
    </button></div>
    {error ? <p className="finding-error mt-3">{error}</p> : null}
    {loading && !data ? <p className="mt-4 text-sm text-muted">Consultando produtos salvos...</p> : null}
    {data ? <><p className="mt-3 text-xs text-muted">Última consulta: {new Date(data.checkedAt).toLocaleString("pt-BR")}</p>
      <div className="shipping-map-list">{data.items.map((item, index) => <article key={item.productId} className="shipping-map-row">
        <div><b>#{index + 1} {item.name}</b><small>{item.brand} · {item.store}</small>
          {item.shippingStatus === "missing_link" ? <div className="shipping-link"><input placeholder="https://link-do-produto" value={links[item.productId] || ""} onChange={(e) => setLinks({ ...links, [item.productId]: e.target.value })}/><button className="btn-ghost" onClick={() => void saveLink(item.productId)}>Salvar link</button></div> : <small>{item.shippingMessage}</small>}
        </div><div className="shipping-map-values"><span>Produto {formatBRL(item.price)}</span><span>Frete {item.shipping === null ? "indisponível" : formatBRL(item.shipping)}</span>{item.deliveryDays !== null ? <span>Prazo: até {item.deliveryDays} dias úteis</span> : null}{item.coupon ? <span>Cupom {item.coupon}: −{formatBRL(item.discount)}</span> : item.discount > 0 ? <span>Desconto: −{formatBRL(item.discount)}</span> : null}<strong>{item.total === null ? "Total pendente" : formatBRL(item.total)}</strong></div>
      </article>)}</div>
    </> : null}
  </section>;
}
