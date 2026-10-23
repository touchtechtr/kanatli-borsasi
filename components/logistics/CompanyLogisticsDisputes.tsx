"use client";

import { useCallback,useEffect,useMemo,useState } from "react";
import { AlertTriangle,Gavel,RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge,SurfaceCard } from "@/components/ui/PlatformUI";

type Dispute={id:string;delivery_id:string;reason:string;status:string;opened_at:string;admin_note:string|null};
type Decision={id:string;dispute_id:string;decision_type:string;buyer_total:number;buyer_refund_amount:number;carrier_payout_amount:number;platform_commission_amount:number;reason:string;status:string};
type Transfer={id:string;decision_id:string;leg_type:string;attempt_no:number;provider:string;gross_amount:number;net_amount:number;transfer_fee:number;status:string;failure_reason:string|null};
const money=(v:number)=>Number(v||0).toLocaleString("tr-TR",{style:"currency",currency:"TRY"});
const label=(v:string)=>v.replaceAll("_"," ");
const tone=(s:string):"neutral"|"violet"|"emerald"|"amber"|"red"|"blue"=>{
 if(["tamamlandi","kapatildi"].includes(s))return"emerald";
 if(["hata","acik"].includes(s))return"red";
 if(["isleniyor","aktarim_suruyor"].includes(s))return"blue";
 return"amber";
};

export default function CompanyLogisticsDisputes(){
 const supabase=useMemo(()=>createClient(),[]);
 const[rows,setRows]=useState<Dispute[]>([]);
 const[decisions,setDecisions]=useState<Decision[]>([]);
 const[transfers,setTransfers]=useState<Transfer[]>([]);
 const[loading,setLoading]=useState(true);
 const[error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{
  setLoading(true);setError(null);
  const[d,k,t]=await Promise.all([
   supabase.from("logistics_disputes").select("id,delivery_id,reason,status,opened_at,admin_note").order("opened_at",{ascending:false}),
   supabase.from("logistics_dispute_decisions").select("id,dispute_id,decision_type,buyer_total,buyer_refund_amount,carrier_payout_amount,platform_commission_amount,reason,status"),
   supabase.from("logistics_dispute_transfers").select("id,decision_id,leg_type,attempt_no,provider,gross_amount,net_amount,transfer_fee,status,failure_reason").order("attempt_no",{ascending:true})
  ]);
  const e=d.error||k.error||t.error;if(e)setError(e.message);else{setRows((d.data??[]) as Dispute[]);setDecisions((k.data??[]) as Decision[]);setTransfers((t.data??[]) as Transfer[])}
  setLoading(false);
 },[supabase]);
 useEffect(()=>{void load()},[load]);
 if(!loading&&!rows.length&&!error)return null;
 return <section className="space-y-4">
  <div className="flex items-end justify-between gap-3"><div><p className="ui-eyebrow">Güvenli ödeme</p><h2 className="ui-section-title">Lojistik uyuşmazlık dosyalarım</h2><p className="ui-section-description">Yönetim kararı ile alıcı iadesi ve nakliyeci ödemesini ayrı ayrı izleyin.</p></div><button onClick={()=>void load()} className="ui-button ui-button--secondary"><RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/>Yenile</button></div>
  {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
  {rows.map(row=>{const decision=decisions.find(x=>x.dispute_id===row.id);const legs=decision?transfers.filter(x=>x.decision_id===decision.id):[];return <SurfaceCard key={row.id}>
   <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex gap-2"><StatusBadge tone={tone(row.status)}>{label(row.status)}</StatusBadge><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">Dosya #{row.id.slice(0,8).toUpperCase()}</span></div><p className="mt-3 text-sm leading-6 text-slate-700">{row.reason}</p><p className="mt-2 text-xs text-slate-400">{new Date(row.opened_at).toLocaleString("tr-TR")}</p></div><AlertTriangle className="h-6 w-6 text-amber-500"/></div>
   {!decision&&<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Para güvenli havuzda korunuyor. Yönetimin gerekçeli kararı bekleniyor.</div>}
   {decision&&<div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4"><div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-black"><Gavel className="h-4 w-4"/>{label(decision.decision_type)}</p><StatusBadge tone={tone(decision.status)}>{label(decision.status)}</StatusBadge></div><p className="mt-3 text-sm leading-6 text-slate-700">{decision.reason}</p><div className="mt-4 grid gap-2 sm:grid-cols-4"><Value label="Havuz" value={money(decision.buyer_total)}/><Value label="Alıcı iadesi" value={money(decision.buyer_refund_amount)}/><Value label="Nakliyeci ödemesi" value={money(decision.carrier_payout_amount)}/><Value label="Komisyon" value={money(decision.platform_commission_amount)}/></div></div>}
   {legs.length>0&&<div className="mt-4 grid gap-2 sm:grid-cols-2">{legs.map(x=><div key={x.id} className="rounded-xl border border-slate-200 p-3 text-xs"><div className="flex items-center justify-between gap-2"><b>{x.leg_type==="buyer_refund"?"Alıcı iadesi":"Nakliyeci ödemesi"} · Deneme {x.attempt_no}</b><StatusBadge tone={tone(x.status)}>{label(x.status)}</StatusBadge></div><p className="mt-2">{x.provider} · Brüt {money(x.gross_amount)} · Net {money(x.net_amount)} · Masraf {money(x.transfer_fee)}</p>{x.failure_reason&&<p className="mt-2 font-semibold text-red-700">{x.failure_reason}</p>}</div>)}</div>}
  </SurfaceCard>})}
 </section>;
}
function Value({label:caption,value}:{label:string;value:string}){return <div className="rounded-xl bg-white/80 p-3"><p className="text-[10px] font-black uppercase text-slate-500">{caption}</p><p className="mt-1 truncate text-sm font-black">{value}</p></div>}
