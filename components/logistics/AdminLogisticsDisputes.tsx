"use client";

import { useCallback,useEffect,useMemo,useState } from "react";
import { AlertTriangle,Banknote,Gavel,RefreshCw,RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState,MetricCard,StatusBadge,SurfaceCard } from "@/components/ui/PlatformUI";

type Dispute={id:string;delivery_id:string;payment_id:string;requester_company_id:string;carrier_company_id:string;reason:string;status:string;opened_at:string;admin_note:string|null};
type Decision={id:string;dispute_id:string;decision_type:string;buyer_total:number;buyer_refund_amount:number;carrier_payout_amount:number;platform_commission_amount:number;reason:string;status:string};
type Transfer={id:string;decision_id:string;leg_type:string;attempt_no:number;provider:string;gross_amount:number;net_amount:number;transfer_fee:number;fee_payer:string;status:string;provider_reference:string|null;failure_reason:string|null};
type Payment={id:string;buyer_total:number;carrier_amount:number;commission_amount:number;status:string;transfer_status:string};
type Evidence={id:string;delivery_id:string;stage:string;evidence_type:string;original_name:string};
type Company={id:string;name:string};
const money=(v:number)=>Number(v||0).toLocaleString("tr-TR",{style:"currency",currency:"TRY"});
const label=(v:string)=>v.replaceAll("_"," ");
const tone=(s:string):"neutral"|"violet"|"emerald"|"amber"|"red"|"blue"=>{
 if(["tamamlandi","kapatildi"].includes(s))return"emerald";
 if(["hata","acik"].includes(s))return"red";
 if(["isleniyor","aktarim_suruyor"].includes(s))return"blue";
 if(["karar_verildi","aktarim_bekliyor","emir_verildi"].includes(s))return"amber";
 return"neutral";
};

export default function AdminLogisticsDisputes(){
 const supabase=useMemo(()=>createClient(),[]);
 const[disputes,setDisputes]=useState<Dispute[]>([]);
 const[decisions,setDecisions]=useState<Decision[]>([]);
 const[transfers,setTransfers]=useState<Transfer[]>([]);
 const[payments,setPayments]=useState<Payment[]>([]);
 const[evidence,setEvidence]=useState<Evidence[]>([]);
 const[companies,setCompanies]=useState<Company[]>([]);
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState<string|null>(null);
 const[error,setError]=useState<string|null>(null);
 const[message,setMessage]=useState<string|null>(null);

 const load=useCallback(async()=>{
  setLoading(true);setError(null);
  const[d,k,t,p,v,c]=await Promise.all([
   supabase.from("logistics_disputes").select("id,delivery_id,payment_id,requester_company_id,carrier_company_id,reason,status,opened_at,admin_note").order("opened_at",{ascending:false}),
   supabase.from("logistics_dispute_decisions").select("id,dispute_id,decision_type,buyer_total,buyer_refund_amount,carrier_payout_amount,platform_commission_amount,reason,status"),
   supabase.from("logistics_dispute_transfers").select("id,decision_id,leg_type,attempt_no,provider,gross_amount,net_amount,transfer_fee,fee_payer,status,provider_reference,failure_reason").order("attempt_no",{ascending:true}),
   supabase.from("logistics_payments").select("id,buyer_total,carrier_amount,commission_amount,status,transfer_status"),
   supabase.from("logistics_delivery_evidence").select("id,delivery_id,stage,evidence_type,original_name").order("created_at",{ascending:true}),
   supabase.from("companies").select("id,name")
  ]);
  const e=d.error||k.error||t.error||p.error||v.error||c.error;
  if(e)setError(e.message);else{setDisputes((d.data??[]) as Dispute[]);setDecisions((k.data??[]) as Decision[]);setTransfers((t.data??[]) as Transfer[]);setPayments((p.data??[]) as Payment[]);setEvidence((v.data??[]) as Evidence[]);setCompanies((c.data??[]) as Company[])}
  setLoading(false);
 },[supabase]);
 useEffect(()=>{void load()},[load]);

 const run=async(key:string,work:()=>PromiseLike<{error:{message:string}|null}>)=>{
  setBusy(key);setError(null);setMessage(null);const r=await work();setBusy(null);
  if(r.error){setError(r.error.message);return false}
  setMessage("Uyuşmazlık dosyası güncellendi.");await load();return true;
 };
 const decide=async(row:Dispute)=>{
  const payment=payments.find(x=>x.id===row.payment_id);
  if(!payment){setError("Uyuşmazlığa bağlı ödeme kaydı bulunamadı.");return}
  const refund=window.prompt(`Alıcıya iade edilecek tutar (havuz: ${money(payment.buyer_total)}):`,"0");if(refund===null)return;
  const carrier=window.prompt(`Nakliyeciye ödenecek brüt tutar (başlangıç alacağı: ${money(payment.carrier_amount)}):`,String(payment.carrier_amount));if(carrier===null)return;
  const commission=window.prompt(`Platform komisyonu (başlangıç: ${money(payment.commission_amount)}):`,String(payment.commission_amount));if(commission===null)return;
  const allocation=Number(refund)+Number(carrier)+Number(commission);
  if(!Number.isFinite(allocation)||Math.abs(allocation-Number(payment.buyer_total))>0.01){setError(`Dağıtım toplamı ${money(payment.buyer_total)} olmalıdır.`);return}
  const reason=window.prompt("Gerekçeli yönetim kararı (en az 10 karakter):");if(!reason)return;
  await run(row.id,()=>supabase.rpc("admin_resolve_logistics_dispute",{p_dispute_id:row.id,p_buyer_refund:Number(refund),p_carrier_payout:Number(carrier),p_platform_commission:Number(commission),p_reason:reason}));
 };
 const createOrder=async(decision:Decision,leg:"buyer_refund"|"carrier_payout")=>{
  const provider=window.prompt("Banka / ödeme kuruluşu:","Manuel banka aktarımı");if(provider===null)return;
  const fee=window.prompt("Aktarım masrafı (₺):","0");if(fee===null)return;
  const payer=window.prompt("Masraf tarafı: platform veya recipient","platform");if(!payer)return;
  const priority=window.prompt("Öncelik (0–100):","50");if(priority===null)return;
  const note=window.prompt("İşlem notu (isteğe bağlı):")??"";
  await run(decision.id+leg,()=>supabase.rpc("admin_create_logistics_dispute_transfer",{p_decision_id:decision.id,p_leg_type:leg,p_provider:provider,p_transfer_fee:Number(fee),p_fee_payer:payer,p_priority:Number(priority),p_note:note}));
 };
 const process=async(row:Transfer,action:"isleme_al"|"tamamla"|"hata")=>{
  const reference=action==="hata"?null:window.prompt(action==="tamamla"?"Banka/dekont referansı:":"Takip referansı (isteğe bağlı):",row.provider_reference??"");
  if(action==="tamamla"&&!reference)return;
  const note=window.prompt(action==="hata"?"Hata açıklaması:":"İşlem notu (isteğe bağlı):")??"";
  if(action==="hata"&&note.trim().length<5)return;
  await run(row.id,()=>supabase.rpc("admin_process_logistics_dispute_transfer",{p_transfer_id:row.id,p_action:action,p_reference:reference,p_note:note}));
 };
 const company=(id:string)=>companies.find(c=>c.id===id)?.name||"Şirket";
 const open=disputes.filter(x=>x.status==="acik").length;
 const waiting=decisions.filter(x=>["aktarim_bekliyor","aktarim_suruyor"].includes(x.status)).length;
 const failed=transfers.filter(x=>x.status==="hata"&&!transfers.some(y=>y.decision_id===x.decision_id&&y.leg_type===x.leg_type&&y.attempt_no>x.attempt_no&&["emir_verildi","isleniyor","tamamlandi"].includes(y.status))).length;

 return <section className="space-y-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="ui-eyebrow">Güvenli ödeme denetimi</p><h2 className="ui-section-title">Lojistik uyuşmazlıkları</h2><p className="ui-section-description">Kanıtları, gerekçeli kararı ve her ödeme ayağının banka denemelerini ayrı ayrı yönetin.</p></div><button onClick={()=>void load()} disabled={loading} className="ui-button ui-button--secondary"><RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/>Yenile</button></div>
  {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
  {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}
  <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Açık dosya" value={open} helper="Karar bekliyor" icon={Gavel} tone={open?"red":"emerald"}/><MetricCard label="Aktarım bekleyen" value={waiting} helper="Karar veya ödeme ayakları" icon={Banknote} tone={waiting?"amber":"emerald"}/><MetricCard label="Çözümlenmemiş hata" value={failed} helper="Yedek emir gerekli" icon={AlertTriangle} tone={failed?"red":"emerald"}/></div>
  <div className="space-y-4">{disputes.map(row=>{const decision=decisions.find(x=>x.dispute_id===row.id);const legs=decision?transfers.filter(x=>x.decision_id===decision.id):[];const payment=payments.find(x=>x.id===row.payment_id);const proofs=evidence.filter(x=>x.delivery_id===row.delivery_id);return <SurfaceCard key={row.id}>
   <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap gap-2"><StatusBadge tone={tone(row.status)}>{label(row.status)}</StatusBadge><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">Dosya #{row.id.slice(0,8).toUpperCase()}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{proofs.length} kanıt</span></div><h3 className="mt-3 text-xl font-black">{company(row.requester_company_id)} → {company(row.carrier_company_id)}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{row.reason}</p><p className="mt-2 text-xs text-slate-400">{new Date(row.opened_at).toLocaleString("tr-TR")}</p></div>{row.status==="acik"&&<button disabled={busy!==null||!payment} onClick={()=>void decide(row)} className="ui-button ui-button--primary"><Gavel className="h-4 w-4"/>Gerekçeli karar ver</button>}</div>
   {payment&&<div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-4"><Value label="Güvenli havuz" value={money(payment.buyer_total)}/><Value label="Başlangıç nakliyeci alacağı" value={money(payment.carrier_amount)}/><Value label="Başlangıç komisyonu" value={money(payment.commission_amount)}/><Value label="Ödeme durumu" value={`${label(payment.status)} · ${label(payment.transfer_status)}`}/></div>}
   {proofs.length>0&&<details className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><summary className="cursor-pointer text-sm font-black text-blue-900">Teslimat kanıtlarını incele ({proofs.length})</summary><div className="mt-3 flex flex-wrap gap-2">{proofs.map(x=><span key={x.id} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{label(x.stage)} · {label(x.evidence_type)} · {x.original_name}</span>)}</div></details>}
   {decision&&<div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase text-violet-700">{label(decision.decision_type)}</p><p className="mt-1 text-sm font-semibold text-slate-700">{decision.reason}</p></div><StatusBadge tone={tone(decision.status)}>{label(decision.status)}</StatusBadge></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><Value label="Havuz" value={money(decision.buyer_total)}/><Value label="Alıcı iadesi" value={money(decision.buyer_refund_amount)}/><Value label="Nakliyeci ödemesi" value={money(decision.carrier_payout_amount)}/><Value label="Komisyon" value={money(decision.platform_commission_amount)}/></div>
    {decision.status!=="tamamlandi"&&<div className="mt-4 flex flex-wrap gap-2">{decision.buyer_refund_amount>0&&!legs.some(x=>x.leg_type==="buyer_refund"&&["emir_verildi","isleniyor","tamamlandi"].includes(x.status))&&<button disabled={busy!==null} onClick={()=>void createOrder(decision,"buyer_refund")} className="ui-button ui-button--secondary">Alıcı iade emri oluştur</button>}{decision.carrier_payout_amount>0&&!legs.some(x=>x.leg_type==="carrier_payout"&&["emir_verildi","isleniyor","tamamlandi"].includes(x.status))&&<button disabled={busy!==null} onClick={()=>void createOrder(decision,"carrier_payout")} className="ui-button ui-button--secondary">Nakliyeci ödeme emri oluştur</button>}</div>}
   </div>}
   {legs.length>0&&<div className="mt-4 grid gap-3 xl:grid-cols-2">{legs.map(leg=><div key={leg.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-slate-500">{leg.leg_type==="buyer_refund"?"Alıcı iadesi":"Nakliyeci ödemesi"} · Deneme {leg.attempt_no}</p><h4 className="mt-1 font-black">{leg.provider}</h4></div><StatusBadge tone={tone(leg.status)}>{label(leg.status)}</StatusBadge></div><div className="mt-3 grid grid-cols-3 gap-2"><Value label="Brüt" value={money(leg.gross_amount)}/><Value label="Masraf" value={money(leg.transfer_fee)}/><Value label="Net" value={money(leg.net_amount)}/></div>{leg.failure_reason&&<p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{leg.failure_reason}</p>}<div className="mt-3 flex flex-wrap gap-2">{leg.status==="emir_verildi"&&<button disabled={busy!==null} onClick={()=>void process(leg,"isleme_al")} className="ui-button ui-button--secondary">İşleme al</button>}{leg.status==="isleniyor"&&<><button disabled={busy!==null} onClick={()=>void process(leg,"tamamla")} className="ui-button ui-button--primary">Tamamla</button><button disabled={busy!==null} onClick={()=>void process(leg,"hata")} className="ui-button ui-button--danger">Hata kaydet</button></>}{leg.status==="hata"&&<button disabled={busy!==null} onClick={()=>void createOrder(decision!,leg.leg_type as "buyer_refund"|"carrier_payout")} className="ui-button ui-button--secondary"><RotateCcw className="h-4 w-4"/>Yedek emir</button>}</div></div>)}</div>}
  </SurfaceCard>})}</div>
  {!loading&&!disputes.length&&<EmptyState icon={Gavel} title="Lojistik uyuşmazlığı bulunmuyor" description="Taraflardan biri uyuşmazlık açtığında güvenli ödeme dosyası burada görünür."/>}
 </section>;
}
function Value({label:caption,value}:{label:string;value:string}){return <div className="rounded-xl bg-white/80 p-3"><p className="text-[10px] font-black uppercase text-slate-500">{caption}</p><p className="mt-1 truncate text-sm font-black">{value}</p></div>}
