"use client";

import { useCallback,useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { ArrowRight,CheckCircle2,MapPin,RefreshCw,Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState,StatusBadge,SurfaceCard } from "@/components/ui/PlatformUI";

type Row={request_id:string;title:string;request_status:string;cargo_type:string;origin_city:string;destination_city:string;pickup_date:string;quantity:number;quantity_unit:string;quote_id:string|null;quote_status:string|null;amount:number|null;currency:string|null;message:string|null;carrier_name:string|null;vehicle_plate:string|null;vehicle_type:string|null;quote_created_at:string|null;relation:"incoming"|"outgoing"};
const money=(value:number)=>Number(value||0).toLocaleString("tr-TR",{style:"currency",currency:"TRY"});
const label=(value:string)=>value.replaceAll("_"," ");
const tone=(status:string):"neutral"|"emerald"|"amber"|"red"|"blue"=>status==="aktif"||status==="kabul_edildi"?"emerald":status==="reddedildi"||status==="iptal"?"red":status==="eslesme_yapildi"?"blue":status==="tamamlandi"?"emerald":"amber";

export default function CompanyLogisticsRequests({compact=false}:{compact?:boolean}){
 const supabase=useMemo(()=>createClient(),[]);
 const[rows,setRows]=useState<Row[]>([]);const[loading,setLoading]=useState(true);const[busy,setBusy]=useState<string|null>(null);const[error,setError]=useState<string|null>(null);const[message,setMessage]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);const result=await supabase.rpc("get_my_logistics_request_quotes");setLoading(false);if(result.error){setError(result.error.message);return}setRows((result.data??[]) as Row[])},[supabase]);
 useEffect(()=>{void load()},[load]);
 const accept=async(row:Row)=>{if(!row.quote_id)return;const ok=window.confirm(`${row.carrier_name||"Nakliyeci"} firmasının ${money(row.amount||0)} tutarındaki teklifini kabul ediyor musunuz? Kabul sonrası ödeme ve taşıma dosyası oluşturulur.`);if(!ok)return;setBusy(row.quote_id);setError(null);setMessage(null);const result=await supabase.rpc("accept_logistics_quote",{p_quote_id:row.quote_id});setBusy(null);if(result.error){setError(result.error.message);return}setMessage("Teklif kabul edildi. Ödeme ve taşıma dosyası oluşturuldu.");await load()};
 const requests=Array.from(new Set(rows.map(x=>x.request_id)));
 if(!loading&&!rows.length&&!error)return null;
 const pending=rows.filter(x=>x.relation==="incoming"&&x.request_status==="aktif"&&x.quote_status==="beklemede").length;
 if(compact)return <SurfaceCard className={pending?"border-amber-200 bg-amber-50/70":""}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="ui-eyebrow">Gelen nakliye teklifleri</p><h2 className="ui-section-title">{pending?`${pending} teklif yanıtınızı bekliyor`:"Bekleyen nakliye teklifi yok"}</h2><p className="ui-section-description">Bütün teklif türlerini merkezi teklif ekranından yönetin.</p></div><Link href="/profil/teklifler?tab=lojistik" className="ui-button ui-button--primary">Teklifleri incele<ArrowRight className="h-4 w-4"/></Link></div></SurfaceCard>;
 return <section className="space-y-4">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="ui-eyebrow">Talep sahibi çalışma alanı</p><h2 className="ui-section-title">Taşıma taleplerim ve gelen teklifler</h2><p className="ui-section-description">Nakliyeci, araç ve teklif tutarını inceleyerek eşleşmeyi buradan yönetin.</p></div><button onClick={()=>void load()} disabled={loading} className="ui-button ui-button--secondary"><RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/>Yenile</button></div>
  {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
  {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}
  {requests.map(id=>{const requestRows=rows.filter(x=>x.request_id===id);const request=requestRows[0];const quotes=requestRows.filter(x=>x.quote_id);return <SurfaceCard key={id}>
   <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap gap-2"><StatusBadge tone={tone(request.request_status)}>{label(request.request_status)}</StatusBadge><StatusBadge tone="neutral">{label(request.cargo_type)}</StatusBadge><StatusBadge tone={request.relation==="incoming"?"emerald":"blue"}>{request.relation==="incoming"?"Gelen":"Gönderilen"}</StatusBadge></div><h3 className="mt-3 text-xl font-black text-slate-950">{request.title}</h3><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4"/>{request.origin_city} → {request.destination_city}</p><p className="mt-1 text-xs text-slate-500">{request.quantity} {request.quantity_unit} · {new Date(request.pickup_date).toLocaleDateString("tr-TR")}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{quotes.length} teklif</span></div>
   {quotes.length?<div className="mt-5 grid gap-3 xl:grid-cols-2">{quotes.map(quote=><div key={quote.quote_id} className={`rounded-2xl border p-4 ${quote.quote_status==="kabul_edildi"?"border-emerald-200 bg-emerald-50/70":quote.quote_status==="reddedildi"?"border-red-200 bg-red-50/60":"border-amber-200 bg-amber-50/60"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-slate-500">{quote.carrier_name||"Nakliyeci"}</p><h4 className="mt-1 text-lg font-black">{money(quote.amount||0)}</h4></div><StatusBadge tone={tone(quote.quote_status||"beklemede")}>{label(quote.quote_status||"beklemede")}</StatusBadge></div><p className="mt-3 flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4"/>{quote.vehicle_plate||"Araç"} · {label(quote.vehicle_type||"araç")}</p>{quote.message&&<p className="mt-3 text-sm leading-6 text-slate-600">{quote.message}</p>}{request.relation==="incoming"&&request.request_status==="aktif"&&quote.quote_status==="beklemede"&&<button disabled={busy!==null} onClick={()=>void accept(quote)} className="ui-button ui-button--primary mt-4 w-full"><CheckCircle2 className="h-4 w-4"/>Teklifi kabul et</button>}</div>)}</div>:<EmptyState icon={Truck} title="Henüz teklif gelmedi" description="Talebiniz yayınlandığında onaylı nakliyecilerin teklifleri burada görünür."/>}
  </SurfaceCard>})}
 </section>;
}

