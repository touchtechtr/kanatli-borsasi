"use client";

import { useCallback,useEffect,useMemo,useState } from "react";
import { CheckCircle2,RefreshCw,Search,ShieldCheck,Truck,XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState,MetricCard,PageHeader,PageShell,StatusBadge,SurfaceCard } from "@/components/ui/PlatformUI";

type Vehicle={id:string;company_id:string;plate:string;vehicle_type:string;brand_model:string|null;capacity:number;capacity_unit:string;status:string;admin_note:string|null;created_at:string;companies:{name:string}|null};
type Capability={vehicle_id:string;capability:string};
type DocumentRow={id:string;vehicle_id:string;document_type:string;storage_path:string;original_name:string};
type MarketItem={id:string;title:string;status:string;created_at:string;company_id:string;kind:"listing"|"request";companies:{name:string}|null};

export default function AdminLogisticsPage(){
 const supabase=useMemo(()=>createClient(),[]);const[vehicles,setVehicles]=useState<Vehicle[]>([]);const[caps,setCaps]=useState<Capability[]>([]);const[docs,setDocs]=useState<DocumentRow[]>([]);const[items,setItems]=useState<MarketItem[]>([]);const[query,setQuery]=useState("");const[busy,setBusy]=useState<string|null>(null);const[error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{setError(null);const[v,c,d,l,r]=await Promise.all([
  supabase.from("logistics_vehicles").select("id,company_id,plate,vehicle_type,brand_model,capacity,capacity_unit,status,admin_note,created_at,companies(name)").order("created_at",{ascending:false}),
  supabase.from("logistics_vehicle_capabilities").select("vehicle_id,capability"),
  supabase.from("logistics_vehicle_documents").select("id,vehicle_id,document_type,storage_path,original_name"),
  supabase.from("logistics_listings").select("id,title,status,created_at,company_id,companies(name)").order("created_at",{ascending:false}),
  supabase.from("logistics_requests").select("id,title,status,created_at,company_id,companies(name)").order("created_at",{ascending:false}),
 ]);const e=v.error||c.error||d.error||l.error||r.error;if(e){setError(e.message);return}setVehicles((v.data??[]) as unknown as Vehicle[]);setCaps((c.data??[]) as Capability[]);setDocs((d.data??[]) as DocumentRow[]);setItems([...(l.data??[]).map(x=>({...x,kind:"listing" as const})),...(r.data??[]).map(x=>({...x,kind:"request" as const}))] as unknown as MarketItem[])},[supabase]);
 useEffect(()=>{void load()},[load]);
 const openDocument=async(path:string)=>{const r=await supabase.storage.from("logistics-documents").createSignedUrl(path,120);if(r.error){setError(r.error.message);return}window.open(r.data.signedUrl,"_blank","noopener,noreferrer")};
 const reviewVehicle=async(id:string,action:string)=>{const note=prompt("Yönetim notu (isteğe bağlı):")||null;setBusy(id);const r=await supabase.rpc("admin_review_logistics_vehicle",{p_vehicle_id:id,p_action:action,p_note:note});setBusy(null);if(r.error){setError(r.error.message);return}await load()};
 const reviewItem=async(item:MarketItem,action:string)=>{const note=prompt("Yönetim notu (isteğe bağlı):")||null;setBusy(item.id);const r=await supabase.rpc("admin_review_logistics_market_item",{p_kind:item.kind,p_id:item.id,p_action:action,p_note:note});setBusy(null);if(r.error){setError(r.error.message);return}await load()};
 const filtered=vehicles.filter(v=>`${v.plate} ${v.companies?.name||""} ${v.vehicle_type}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
 const pendingVehicles=vehicles.filter(v=>v.status==="inceleme_bekliyor").length;const pendingItems=items.filter(i=>i.status==="inceleme_bekliyor").length;
 return <PageShell>
  <PageHeader eyebrow="Lojistik güven ve uygunluk" title="Nakliye Yönetimi" icon={Truck} tone="violet" description="Nakliyeci faaliyetlerini, araç belgelerini, yetkinlikleri ve pazar kayıtlarını tek merkezden denetleyin." actions={<button onClick={()=>void load()} className="ui-button ui-button--secondary"><RefreshCw className="h-4 w-4"/>Yenile</button>}/>
  {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
  <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Araç incelemesi" value={pendingVehicles} helper="Onay bekleyen araç" tone="amber" icon={Truck}/><MetricCard label="Pazar incelemesi" value={pendingItems} helper="İlan ve taşıma talebi" tone="violet" icon={ShieldCheck}/><MetricCard label="Onaylı araç" value={vehicles.filter(v=>v.status==="onaylandi").length} helper="Aktif filoya uygun" tone="emerald" icon={CheckCircle2}/></div>
  <SurfaceCard><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} className="ui-input pl-10" placeholder="Firma, plaka veya araç türü ara..."/></div></SurfaceCard>
  <div><h2 className="ui-section-title">Araç ve belge incelemeleri</h2><p className="ui-section-description">Faaliyet onayı tek başına yeterli değildir; her araç ayrı değerlendirilir.</p></div>
  <div className="grid gap-4 xl:grid-cols-2">{filtered.map(v=><SurfaceCard key={v.id} interactive>
   <div className="flex justify-between gap-4"><div><p className="ui-eyebrow">{v.companies?.name||"Şirket bilgisi yok"}</p><h3 className="mt-1 text-xl font-black">{v.plate}</h3><p className="text-sm text-slate-500">{v.vehicle_type.replaceAll("_"," ")} · {v.brand_model||"—"} · {v.capacity} {v.capacity_unit}</p></div><StatusBadge tone={v.status==="onaylandi"?"emerald":v.status==="reddedildi"?"red":"amber"}>{v.status.replaceAll("_"," ")}</StatusBadge></div>
   <div className="mt-4 flex flex-wrap gap-2">{caps.filter(c=>c.vehicle_id===v.id).map(c=><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700" key={c.capability}>{c.capability.replaceAll("_"," ")}</span>)}</div><div className="mt-4 flex flex-wrap gap-2">{docs.filter(d=>d.vehicle_id===v.id).map(d=><button type="button" onClick={()=>void openDocument(d.storage_path)} key={d.id} className="ui-button ui-button--secondary">{d.document_type.replaceAll("_"," ")} · aç</button>)}</div>
   {v.admin_note&&<p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">{v.admin_note}</p>}
   <div className="mt-5 flex flex-wrap gap-2"><button disabled={busy!==null} onClick={()=>void reviewVehicle(v.id,"onayla")} className="ui-button ui-button--primary"><CheckCircle2 className="h-4 w-4"/>Onayla</button><button disabled={busy!==null} onClick={()=>void reviewVehicle(v.id,"duzeltme")} className="ui-button ui-button--secondary">Düzeltme iste</button><button disabled={busy!==null} onClick={()=>void reviewVehicle(v.id,"reddet")} className="ui-button ui-button--danger"><XCircle className="h-4 w-4"/>Reddet</button></div>
  </SurfaceCard>)}</div>
  {!filtered.length&&<EmptyState icon={Truck} title="Araç kaydı bulunamadı" description="Filtreye uygun araç başvurusu yok."/>}
  <div className="mt-3"><h2 className="ui-section-title">Lojistik ilanları ve taşıma talepleri</h2><p className="ui-section-description">Yayınlanmadan önce firma, araç ve taşıma türü uyumunu kontrol edin.</p></div>
  <div className="space-y-3">{items.map(i=><SurfaceCard key={i.kind+i.id} interactive className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex gap-2"><StatusBadge tone={i.status==="aktif"?"emerald":"amber"}>{i.status.replaceAll("_"," ")}</StatusBadge><StatusBadge tone="violet">{i.kind==="listing"?"Hizmet ilanı":"Taşıma talebi"}</StatusBadge></div><h3 className="mt-3 font-black">{i.title}</h3><p className="mt-1 text-sm text-slate-500">{i.companies?.name||"Şirket bilgisi yok"} · {new Date(i.created_at).toLocaleString("tr-TR")}</p></div>{i.status==="inceleme_bekliyor"&&<div className="flex gap-2"><button disabled={busy!==null} onClick={()=>void reviewItem(i,"onayla")} className="ui-button ui-button--primary">Onayla ve yayınla</button><button disabled={busy!==null} onClick={()=>void reviewItem(i,"reddet")} className="ui-button ui-button--danger">Reddet</button></div>}</SurfaceCard>)}</div>
 </PageShell>
}