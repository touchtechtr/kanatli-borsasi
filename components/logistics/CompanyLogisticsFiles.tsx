"use client";

import { useCallback,useEffect,useMemo,useState } from "react";
import { AlertTriangle,Banknote,CheckCircle2,FileUp,KeyRound,PackageCheck,RefreshCw,Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState,MetricCard,StatusBadge,SurfaceCard } from "@/components/ui/PlatformUI";

type Access={company_id?:string|null};
type DeliveryParty={delivery_id:string;requester_name:string;carrier_name:string};
type Delivery={id:string;request_id:string;requester_company_id:string;carrier_company_id:string;status:string;payment_status:string;agreed_amount:number;currency:string;created_at:string;completed_at:string|null;dispute_reason:string|null};
type Payment={id:string;delivery_id:string;status:string;transfer_status:string;carrier_amount:number;commission_amount:number;buyer_total:number;transfer_error:string|null};
type Transfer={id:string;delivery_id:string;attempt_no:number;provider:string;status:string;transfer_fee:number;fee_payer:string;carrier_net_amount:number;provider_reference:string|null;failure_reason:string|null};
type Event={id:string;delivery_id:string;event_type:string;sequence_no:number;created_at:string;provider_reference:string|null};
type Evidence={id:string;delivery_id:string;stage:string;evidence_type:string;original_name:string;storage_path:string};
type Secret={delivery_id:string;pickup_code:string;delivery_code:string};

const money=(v:number)=>Number(v||0).toLocaleString("tr-TR",{style:"currency",currency:"TRY"});
const label=(v:string)=>v.replaceAll("_"," ");
const tone=(s:string):"neutral"|"violet"|"emerald"|"amber"|"red"|"blue"=>{
  if(["tamamlandi","serbest_birakildi"].includes(s))return "emerald";
  if(["hata","uyusmazlik","iptal"].includes(s))return "red";
  if(["tasimada","havuzda","isleniyor"].includes(s))return "blue";
  if(["odeme_bekliyor","yukleme_bekliyor","teslim_onayi_bekliyor","teslim_onaylandi","emir_verildi"].includes(s))return "amber";
  return "neutral";
};

export default function CompanyLogisticsFiles(){
  const supabase=useMemo(()=>createClient(),[]);
  const[companyId,setCompanyId]=useState<string|null>(null);
  const[parties,setParties]=useState<DeliveryParty[]>([]);
  const[deliveries,setDeliveries]=useState<Delivery[]>([]);
  const[payments,setPayments]=useState<Payment[]>([]);
  const[transfers,setTransfers]=useState<Transfer[]>([]);
  const[events,setEvents]=useState<Event[]>([]);
  const[evidence,setEvidence]=useState<Evidence[]>([]);
  const[secrets,setSecrets]=useState<Secret[]>([]);
  const[busy,setBusy]=useState<string|null>(null);
  const[error,setError]=useState<string|null>(null);
  const[message,setMessage]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setError(null);
    const accessResult=await supabase.rpc("get_my_logistics_access");
    if(accessResult.error){setError(accessResult.error.message);return}
    const access=(accessResult.data??{}) as Access;
    setCompanyId(access.company_id??null);
    if(!access.company_id){setDeliveries([]);return}
    const[d,p,t,e,k,s,c]=await Promise.all([
      supabase.from("logistics_deliveries").select("id,request_id,requester_company_id,carrier_company_id,status,payment_status,agreed_amount,currency,created_at,completed_at,dispute_reason").order("created_at",{ascending:false}),
      supabase.from("logistics_payments").select("id,delivery_id,status,transfer_status,carrier_amount,commission_amount,buyer_total,transfer_error"),
      supabase.from("logistics_transfer_orders").select("id,delivery_id,attempt_no,provider,status,transfer_fee,fee_payer,carrier_net_amount,provider_reference,failure_reason").order("attempt_no",{ascending:true}),
      supabase.from("logistics_delivery_events").select("id,delivery_id,event_type,sequence_no,created_at,provider_reference").order("sequence_no",{ascending:true}),
      supabase.from("logistics_delivery_evidence").select("id,delivery_id,stage,evidence_type,original_name,storage_path").order("created_at",{ascending:true}),
      supabase.from("logistics_delivery_secrets").select("delivery_id,pickup_code,delivery_code"),
      supabase.rpc("get_my_logistics_delivery_parties"),
    ]);
    const loadError=d.error||p.error||t.error||e.error||k.error||s.error||c.error;
    if(loadError){setError(loadError.message);return}
    setDeliveries((d.data??[]) as Delivery[]);
    setPayments((p.data??[]) as Payment[]);
    setTransfers((t.data??[]) as Transfer[]);
    setEvents((e.data??[]) as Event[]);
    setEvidence((k.data??[]) as Evidence[]);
    setSecrets((s.data??[]) as Secret[]);
    setParties((c.data??[]) as DeliveryParty[]);
  },[supabase]);

  useEffect(()=>{void load()},[load]);
  const partyFor=(deliveryId:string)=>parties.find(x=>x.delivery_id===deliveryId);
  const run=async(key:string,work:()=>PromiseLike<{error:{message:string}|null}>)=>{
    setBusy(key);setError(null);setMessage(null);const result=await work();setBusy(null);
    if(result.error){setError(result.error.message);return}
    setMessage("Nakliye dosyası güncellendi.");await load();
  };
  const uploadEvidence=async(delivery:Delivery,stage:"yukleme"|"teslimat",file:File)=>{
    if(!companyId)return;
    setBusy(delivery.id+stage);setError(null);
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=`${companyId}/deliveries/${delivery.id}/${stage}-${Date.now()}-${safe}`;
    const upload=await supabase.storage.from("logistics-documents").upload(path,file,{contentType:file.type,upsert:false});
    if(upload.error){setBusy(null);setError(upload.error.message);return}
    const type=file.type.startsWith("video/")?"video":file.type.startsWith("image/")?"fotograf":"tutanak";
    const result=await supabase.rpc("register_logistics_delivery_evidence",{p_delivery_id:delivery.id,p_stage:stage,p_evidence_type:type,p_storage_path:path,p_original_name:file.name,p_mime_type:file.type||null,p_file_size:file.size});
    setBusy(null);
    if(result.error){setError(result.error.message);return}
    setMessage("Teslimat kanıtı güvenli dosyaya eklendi.");await load();
  };
  const start=(delivery:Delivery)=>{
    const code=window.prompt("Talep sahibinin verdiği 6 haneli yükleme kodu:");
    if(!code)return Promise.resolve();
    return run(delivery.id,()=>supabase.rpc("start_logistics_delivery",{p_delivery_id:delivery.id,p_pickup_code:code}));
  };
  const confirm=(delivery:Delivery)=>{
    const secret=secrets.find(s=>s.delivery_id===delivery.id);
    const code=secret?.delivery_code||window.prompt("6 haneli teslimat kodu:");
    if(!code)return Promise.resolve();
    return run(delivery.id,()=>supabase.rpc("confirm_logistics_delivery",{p_delivery_id:delivery.id,p_delivery_code:code}));
  };
  const dispute=(delivery:Delivery)=>{
    const reason=window.prompt("Uyuşmazlık gerekçesini ayrıntılı yazın:");
    if(!reason)return Promise.resolve();
    return run(delivery.id,()=>supabase.rpc("dispute_logistics_delivery",{p_delivery_id:delivery.id,p_reason:reason}));
  };

  const active=deliveries.filter(d=>!["tamamlandi","iptal"].includes(d.status)).length;
  const inTransit=deliveries.filter(d=>d.status==="tasimada").length;
  const waitingTransfer=payments.filter(p=>["emir_verildi","isleniyor","hata"].includes(p.transfer_status)).length;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="ui-section-title">Taşıma dosyalarım</h2><p className="ui-section-description">Yükleme, kanıt, teslim onayı, güvenli ödeme ve aktarım durumlarını takip edin.</p></div><button onClick={()=>void load()} className="ui-button ui-button--secondary"><RefreshCw className="h-4 w-4"/>Dosyaları yenile</button></div>
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}
    <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Aktif dosya" value={active} helper="Devam eden taşıma" icon={Truck} tone="blue"/><MetricCard label="Yolda" value={inTransit} helper="Taşıması başlayan" icon={PackageCheck} tone="violet"/><MetricCard label="Aktarım takibi" value={waitingTransfer} helper="Emir, işlem veya hata" icon={Banknote} tone={waitingTransfer?"amber":"emerald"}/></div>

    <div className="space-y-4">{deliveries.map(delivery=>{
      const requester=delivery.requester_company_id===companyId;
      const carrier=delivery.carrier_company_id===companyId;
      const payment=payments.find(p=>p.delivery_id===delivery.id);
      const secret=secrets.find(s=>s.delivery_id===delivery.id);
      const fileEvidence=evidence.filter(e=>e.delivery_id===delivery.id);
      const fileTransfers=transfers.filter(t=>t.delivery_id===delivery.id);
      const fileEvents=events.filter(e=>e.delivery_id===delivery.id);
      const party=partyFor(delivery.id);
      const terminal=["tamamlandi","iptal","uyusmazlik"].includes(delivery.status);
      return <SurfaceCard key={delivery.id} interactive>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap gap-2"><StatusBadge tone={tone(delivery.status)}>{label(delivery.status)}</StatusBadge><StatusBadge tone={requester?"emerald":"violet"}>{requester?"Talep sahibi":"Nakliyeci"}</StatusBadge>{payment&&<StatusBadge tone={tone(payment.transfer_status)}>Aktarım: {label(payment.transfer_status)}</StatusBadge>}</div><h3 className="mt-3 text-lg font-black">{party?.requester_name||"Talep sahibi"} → {party?.carrier_name||"Nakliyeci"}</h3><p className="mt-1 text-xs text-slate-500">Dosya {delivery.id.slice(0,8).toUpperCase()} · {new Date(delivery.created_at).toLocaleString("tr-TR")}</p></div>
          {payment&&<div className="grid min-w-[290px] grid-cols-3 gap-2"><SmallValue label={requester?"Toplam":"Brüt"} value={money(requester?payment.buyer_total:payment.carrier_amount)}/><SmallValue label="Komisyon" value={money(payment.commission_amount)}/><SmallValue label="Durum" value={label(payment.status)}/></div>}
        </div>

        {requester&&secret&&!terminal&&<div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="flex items-center gap-2 text-xs font-black uppercase text-amber-800"><KeyRound className="h-4 w-4"/>Yükleme kodu</p><p className="mt-2 text-2xl font-black tracking-[.25em]">{secret.pickup_code}</p><p className="mt-1 text-xs text-amber-800">Araç ve yük hazırken nakliyeciye verin.</p></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 text-xs font-black uppercase text-emerald-800"><KeyRound className="h-4 w-4"/>Teslimat kodu</p><p className="mt-2 text-2xl font-black tracking-[.25em]">{secret.delivery_code}</p><p className="mt-1 text-xs text-emerald-800">Ürünü kontrol etmeden paylaşmayın.</p></div></div>}

        <div className="mt-4 flex flex-wrap gap-2">
          {carrier&&delivery.status==="yukleme_bekliyor"&&<><EvidenceButton label="Yükleme kanıtı ekle" disabled={busy!==null} onFile={file=>void uploadEvidence(delivery,"yukleme",file)}/><button disabled={busy!==null} onClick={()=>void start(delivery)} className="ui-button ui-button--primary"><Truck className="h-4 w-4"/>Taşımayı başlat</button></>}
          {carrier&&delivery.status==="tasimada"&&<><EvidenceButton label="Teslimat kanıtı ekle" disabled={busy!==null} onFile={file=>void uploadEvidence(delivery,"teslimat",file)}/><button disabled={busy!==null} onClick={()=>void run(delivery.id,()=>supabase.rpc("mark_logistics_delivered",{p_delivery_id:delivery.id}))} className="ui-button ui-button--primary"><PackageCheck className="h-4 w-4"/>Teslim edildi bildir</button></>}
          {requester&&delivery.status==="teslim_onayi_bekliyor"&&<button disabled={busy!==null} onClick={()=>void confirm(delivery)} className="ui-button ui-button--primary"><CheckCircle2 className="h-4 w-4"/>Kontrol ettim, teslim aldım</button>}
          {["yukleme_bekliyor","tasimada","teslim_onayi_bekliyor","teslim_onaylandi"].includes(delivery.status)&&<button disabled={busy!==null} onClick={()=>void dispute(delivery)} className="ui-button ui-button--danger"><AlertTriangle className="h-4 w-4"/>Uyuşmazlık bildir</button>}
        </div>

        {delivery.dispute_reason&&<p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{delivery.dispute_reason}</p>}
        {fileEvidence.length>0&&<div className="mt-5"><p className="text-sm font-extrabold">Kanıtlar ({fileEvidence.length})</p><div className="mt-2 flex flex-wrap gap-2">{fileEvidence.map(item=><span key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold">{label(item.stage)} · {label(item.evidence_type)} · {item.original_name}</span>)}</div></div>}
        {fileTransfers.length>0&&<div className="mt-5 grid gap-2 lg:grid-cols-2">{fileTransfers.map(item=><div key={item.id} className="rounded-xl border border-slate-200 p-3 text-xs"><div className="flex items-center justify-between"><b>{item.provider} · Deneme {item.attempt_no}</b><StatusBadge tone={tone(item.status)}>{label(item.status)}</StatusBadge></div><p className="mt-2">Net: <b>{money(item.carrier_net_amount)}</b> · Masraf: <b>{money(item.transfer_fee)}</b></p>{item.failure_reason&&<p className="mt-2 text-red-700">{item.failure_reason}</p>}</div>)}</div>}
        {fileEvents.length>0&&<details className="mt-5 rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-extrabold">Olay geçmişi ({fileEvents.length})</summary><div className="mt-3 space-y-2">{fileEvents.map(item=><p key={item.id} className="text-xs text-slate-600"><b>#{item.sequence_no} {label(item.event_type)}</b> · {new Date(item.created_at).toLocaleString("tr-TR")}</p>)}</div></details>}
      </SurfaceCard>;
    })}</div>
    {!deliveries.length&&<EmptyState icon={Truck} title="Taşıma dosyanız bulunmuyor" description="Kabul edilen bir lojistik teklifi olduğunda yükleme, teslimat ve ödeme süreci burada görünür."/>}
  </div>;
}

function SmallValue({label:caption,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">{caption}</p><p className="mt-1 truncate text-sm font-black">{value}</p></div>}
function EvidenceButton({label:caption,onFile,disabled}:{label:string;onFile:(file:File)=>void;disabled:boolean}){return <label className="ui-button ui-button--secondary cursor-pointer"><FileUp className="h-4 w-4"/>{caption}<input type="file" className="hidden" accept=".pdf,image/jpeg,image/png,video/mp4,video/webm" disabled={disabled} onChange={e=>{const file=e.target.files?.[0];if(file)onFile(file)}}/></label>}
