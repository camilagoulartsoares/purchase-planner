import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Link2, Pencil, Plus, Share2, Trash2, X } from "lucide-react";
import * as api from "../api/closet";
import { CATEGORIES, formatBRL, type Finding, type FindingInput, type FindingMedia } from "../types";

const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='800'%3E%3Crect width='100%25' height='100%25' fill='%23efe8df'/%3E%3Cpath d='M210 260h220v250H210z' fill='%23dfd1c2'/%3E%3Ccircle cx='320' cy='340' r='44' fill='%23b76e79' opacity='.55'/%3E%3C/svg%3E";

const blank: FindingInput = { title: "", brand: null, store: null, description: null, price: null, previousPrice: null, shippingPrice: null, currency: "BRL", originalUrl: "", category: null, availability: null, media: [] };
const asText = (value: string | null | undefined) => value || "";
const priceText = (price: number | null, currency = "BRL") => price === null ? "Preço não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(price);

function imageIsReachable(url: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => { image.src = ""; resolve(false); }, 6000);
    image.onload = () => { window.clearTimeout(timer); resolve(true); };
    image.onerror = () => { window.clearTimeout(timer); resolve(false); };
    image.src = url;
  });
}

async function prioritizeWorkingMedia(media: FindingMedia[]) {
  const imageChecks = await Promise.all(media.map(async (entry) => entry.type === "image" ? imageIsReachable(entry.url) : true));
  // Broken sources are retained for transparency, but never become the main
  // preview or the image used to create the Product card.
  return media
    .map((entry, index) => ({ entry, works: imageChecks[index], score: entry.type === "image" && imageChecks[index] ? 2 : entry.type === "video" ? 1 : 0 }))
    .sort((left, right) => right.score - left.score)
    .map(({ entry }) => entry);
}

function Gallery({ media, alt }: { media: FindingMedia[]; alt: string }) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<string[]>([]);
  useEffect(() => setActive(0), [media]);
  const item = media[active];
  if (!item) return <div className="finding-media-empty">Imagem indisponível</div>;
  const choose = (index: number) => setActive((index + media.length) % media.length);
  return <div className="finding-gallery">
    <div className="finding-media-stage">
      {item.type === "video" ? <video key={item.url} src={item.url} controls preload="metadata" /> : <img src={broken.includes(item.url) ? placeholder : item.url} alt={alt} onError={() => { setBroken((old) => old.includes(item.url) ? old : [...old, item.url]); if (media.length > 1) setActive((old) => (old + 1) % media.length); }} />}
      {media.length > 1 ? <><button type="button" className="finding-gallery-arrow is-left" onClick={() => choose(active - 1)} aria-label="Mídia anterior" title="Mídia anterior"><ChevronLeft size={20} /></button><button type="button" className="finding-gallery-arrow is-right" onClick={() => choose(active + 1)} aria-label="Próxima mídia" title="Próxima mídia"><ChevronRight size={20} /></button></> : null}
    </div>
    {media.length > 1 ? <div className="finding-thumbnails" aria-label="Galeria de mídias">{media.map((entry, index) => <button type="button" key={`${entry.type}-${entry.url}`} onClick={() => setActive(index)} className={index === active ? "is-active" : ""} aria-label={`Abrir mídia ${index + 1}`} aria-current={index === active ? "true" : undefined}>{entry.type === "video" ? <video src={entry.url} muted preload="metadata" /> : <img src={broken.includes(entry.url) ? placeholder : entry.url} alt="" onError={() => setBroken((old) => old.includes(entry.url) ? old : [...old, entry.url])} />}{entry.type === "video" ? <span>Vídeo</span> : null}</button>)}</div> : null}
  </div>;
}

function FindingForm({ value, onChange }: { value: FindingInput; onChange: (next: FindingInput) => void }) {
  type TextKey = "title" | "brand" | "store" | "description" | "category" | "availability" | "originalUrl";
  type NumberKey = "price" | "previousPrice" | "shippingPrice";
  const field = (key: TextKey | NumberKey, label: string, kind: "text" | "number" | "textarea" = "text") => <label className="field"><span>{label}</span>{kind === "textarea" ? <textarea value={asText(value[key] as string | null)} onChange={(e) => onChange({ ...value, [key]: e.target.value || null })} rows={3} /> : <input type={kind} value={value[key] as string | number | null ?? ""} onChange={(e) => onChange({ ...value, [key]: kind === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : (e.target.value || null) })} />}</label>;
  return <div className="finding-form-grid">
    {field("title", "Nome")}{field("brand", "Marca")}{field("store", "Loja")}{field("price", "Preço atual", "number")}{field("previousPrice", "Preço anterior", "number")}{field("shippingPrice", "Frete", "number")}<label className="field"><span>Tipo de roupa / categoria</span><select value={asText(value.category)} onChange={(e) => onChange({ ...value, category: e.target.value || null })}><option value="">Escolha depois</option>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>{field("availability", "Disponibilidade")}{field("originalUrl", "Link original")}
    <div className="finding-form-wide">{field("description", "Descrição", "textarea")}</div>
  </div>;
}

export function FindingsSection() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"none" | "url" | "review" | "view" | "edit" | "remove">("none");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<FindingInput>(blank);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modalError, setModalError] = useState("");
  const [toast, setToast] = useState("");
  const load = async () => { setLoading(true); setLoadError(""); try { setFindings(await api.fetchFindings()); } catch (error) { setLoadError(error instanceof Error ? error.message : "Não foi possível carregar seus achados."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(id); }, [toast]);
  const close = () => { if (previewLoading || saving || deleting) return; setMode("none"); setModalError(""); };
  const preview = async () => { if (!url.trim() || previewLoading) return; setPreviewLoading(true); setModalError(""); try { const result = await api.previewFinding(url); const media = await prioritizeWorkingMedia(result.media || []); setDraft({ ...blank, ...result, media }); setMode("review"); } catch (error) { setModalError(error instanceof Error ? error.message : "Não foi possível analisar este link."); } finally { setPreviewLoading(false); } };
  const save = async () => { if (saving) return; setSaving(true); setModalError(""); try { if (draft.price == null || draft.price <= 0) throw new Error("Informe o preço atual para adicionar este produto à sua lista."); const category = CATEGORIES.includes(draft.category as typeof CATEGORIES[number]) ? draft.category! : "Outros"; const product = new FormData(); product.set("name", draft.title || "Produto por link"); product.set("category", category); product.set("brand", draft.brand || draft.store || "Marca não informada"); product.set("store", draft.store || "Loja não informada"); product.set("originalPrice", String(draft.previousPrice && draft.previousPrice > draft.price ? draft.previousPrice : draft.price)); product.set("promotionalPrice", draft.previousPrice && draft.previousPrice > draft.price ? String(draft.price) : ""); product.set("shippingPrice", draft.shippingPrice == null ? "" : String(draft.shippingPrice)); product.set("purchaseUrl", draft.originalUrl); product.set("imageUrl", draft.media.find((media) => media.type === "image")?.url || ""); product.set("priority", "Quero"); product.set("status", "Quero comprar"); product.set("notes", "Adicionado por link."); const isBody = category === "Bodies" || /^body\b/i.test(draft.title || ""); await api.saveProduct(product); if (!isBody) { const created = await api.createFinding(draft); setFindings((old) => [created, ...old]); } setMode("none"); setToast(isBody ? "Body adicionado em Produtos" : "Produto adicionado à sua lista"); window.setTimeout(() => window.location.assign("/?tab=moda"), 650); } catch (error) { const message = error instanceof Error ? error.message : "Não foi possível salvar o produto."; setModalError(/já está salvo|ja esta salvo/i.test(message) ? "Este produto já está nos seus achados" : message); } finally { setSaving(false); } };
  const edit = async () => { if (!selected || saving) return; setSaving(true); setModalError(""); try { const updated = await api.updateFinding(selected.id, draft); setFindings((old) => old.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); setMode("view"); setToast("Achado atualizado"); } catch (error) { setModalError(error instanceof Error ? error.message : "Não foi possível atualizar o achado."); } finally { setSaving(false); } };
  const remove = async () => { if (!selected || deleting) return; setDeleting(true); try { await api.deleteFinding(selected.id); setFindings((old) => old.filter((item) => item.id !== selected.id)); setMode("none"); setToast("Produto removido dos seus achados"); } catch (error) { setModalError(error instanceof Error ? error.message : "Não foi possível remover o achado."); } finally { setDeleting(false); } };
  const share = async (item: Finding) => { try { const canShare = "share" in navigator; if (canShare) await navigator.share({ title: item.title, url: item.originalUrl }); else await navigator.clipboard.writeText(item.originalUrl); setToast(canShare ? "Compartilhamento aberto" : "Link copiado"); } catch { /* cancelamento de compartilhamento não é erro */ } };
  const openView = (item: Finding) => { setSelected(item); setMode("view"); setModalError(""); };
  const openEdit = (item: Finding) => { setSelected(item); const { id, normalizedUrl, createdAt, updatedAt, ...data } = item; void id; void normalizedUrl; void createdAt; void updatedAt; setDraft(data); setMode("edit"); setModalError(""); };
  return <section className="finding-section card-soft mb-6 p-4">
    <div className="finding-section-head"><div><p className="planner-kicker"><Link2 size={15} /> Meus achados</p><h2 className="font-display mt-2 text-3xl font-semibold text-brown-deep">Produtos que você encontrou</h2><p className="mt-1 text-sm text-muted">Salve qualquer produto pelo link e mantenha sua galeria completa.</p></div><button type="button" className="btn-primary" onClick={() => { setUrl(""); setModalError(""); setMode("url"); }} title="Adicionar um produto pelo link" aria-label="Adicionar um produto pelo link"><Plus size={16} /> Adicionar por link</button></div>
    {loading ? <div className="finding-list">{[1, 2, 3].map((n) => <div key={n} className="finding-skeleton"><span className="skeleton-block" /><span className="skeleton-line" /><span className="skeleton-line" /></div>)}</div> : loadError ? <div className="finding-empty"><p>{loadError}</p><button type="button" className="btn-ghost" onClick={() => void load()}>Tentar novamente</button></div> : findings.length === 0 ? <div className="finding-empty">Você ainda não salvou nenhum achado. Cole o link de um produto que gostou para começar.</div> : <div className="finding-list">{findings.map((item) => <article className="finding-card" key={item.id} onClick={() => openView(item)} role="button" tabIndex={0} aria-label={`Abrir ${item.title || "produto salvo"}`} onKeyDown={(e) => e.key === "Enter" && openView(item)}><img src={item.media.find((m) => m.type === "image")?.url || placeholder} alt={item.title || "Produto salvo"} onError={(e) => { e.currentTarget.src = placeholder; }} /><div className="finding-card-copy"><small>{item.brand || "Marca não informada"} · {item.store || "Loja não informada"}</small><h3>{item.title || "Produto sem nome"}</h3><strong>{priceText(item.price, item.currency)}</strong></div><div className="finding-card-actions" onClick={(e) => e.stopPropagation()}><button type="button" className="btn-ghost" onClick={() => openView(item)} title={`Ver ${item.title || "produto salvo"}`}>Ver produto</button><button type="button" className="btn-ghost" onClick={() => openEdit(item)}><Pencil size={14} /> Editar</button><button type="button" className="btn-ghost" onClick={() => { setSelected(item); setMode("remove"); setModalError(""); }}><Trash2 size={14} /> Remover</button><button type="button" className="btn-ghost" onClick={() => void share(item)} title={`Compartilhar ${item.title || "produto salvo"}`}><Share2 size={14} /> Compartilhar</button></div></article>)}</div>}
    {toast ? <div className="finding-toast" role="status">{toast}</div> : null}
    {mode !== "none" ? <div className="finding-modal-backdrop" role="presentation" onMouseDown={close}><section className="finding-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}><button type="button" className="finding-close" onClick={close} aria-label="Fechar"><X size={20} /></button>
      {mode === "url" ? <><h2>Adicionar por link</h2><p>Cole a URL do produto para buscar os dados e todas as mídias disponíveis.</p><label className="field"><span>URL do produto</span><input autoFocus type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void preview()} /></label>{modalError ? <p className="finding-error">{modalError}</p> : null}<footer><button type="button" className="btn-ghost" onClick={close}>Cancelar</button><button type="button" className="btn-primary" disabled={previewLoading || !url.trim()} onClick={() => void preview()}>{previewLoading ? "Buscando produto..." : "Buscar produto"}</button></footer></> : null}
      {mode === "review" || mode === "edit" ? <><h2>{mode === "review" ? "Revise seu produto" : "Editar achado"}</h2><p>Escolha o tipo de roupa antes de salvar. O produto será adicionado à sua lista.</p><div className="finding-modal-scroll"><Gallery media={draft.media} alt={draft.title || "Prévia do produto"} /><FindingForm value={draft} onChange={setDraft} /></div>{modalError ? <p className="finding-error">{modalError}</p> : null}<footer><button type="button" className="btn-ghost" onClick={close}>Cancelar</button><button type="button" className="btn-primary" disabled={saving} onClick={() => void (mode === "edit" ? edit() : save())}>{saving ? "Salvando..." : mode === "edit" ? "Salvar alterações" : "Adicionar à minha lista"}</button></footer></> : null}
      {mode === "view" && selected ? <><h2>{selected.title || "Produto salvo"}</h2><div className="finding-modal-scroll"><Gallery media={selected.media} alt={selected.title} /><p className="finding-meta">{selected.brand || "Marca não informada"} · {selected.store || "Loja não informada"}</p><p>{selected.description || "Sem descrição disponível."}</p><p className="finding-price">{priceText(selected.price, selected.currency)} {selected.previousPrice !== null ? <del>{formatBRL(selected.previousPrice)}</del> : null}</p><a className="btn-primary" href={selected.originalUrl} target="_blank" rel="noreferrer">Abrir na loja <ExternalLink size={15} /></a></div></> : null}
      {mode === "remove" && selected ? <><h2>Remover achado?</h2><p>Deseja remover este produto dos seus achados?</p>{modalError ? <p className="finding-error">{modalError}</p> : null}<footer><button type="button" className="btn-ghost" onClick={close}>Cancelar</button><button type="button" className="btn-primary" disabled={deleting} onClick={() => void remove()}>{deleting ? "Removendo..." : "Remover"}</button></footer></> : null}
    </section></div> : null}
  </section>;
}
