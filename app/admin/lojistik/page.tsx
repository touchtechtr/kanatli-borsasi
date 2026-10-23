"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Banknote, CheckCircle2, Clock3, FileCheck2,
  RefreshCw, Search, ShieldCheck, Truck, Wallet, XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  EmptyState, MetricCard, PageHeader, PageShell, StatusBadge, SurfaceCard,
} from "@/components/ui/PlatformUI";
import AdminLogisticsDisputes from "@/components/logistics/AdminLogisticsDisputes";

type Company={id:string;name:string};
type Vehicle={id:string;company_id:string;plate:string;vehicle_type:string;brand_model:string|null;capacity:number;capacity_unit:string;status:string;admin_note:string|null;created_at:string};
type Capability={vehicle_id:string;capability:string};
type DocumentRow={id:string;vehicle_id:string;document_type:string;storage_path:string;original_name:string};
type MarketItem={id:string;title:string;status:string;created_at:string;company_id:string;kind:"listing"|"request"};
type Delivery={id:string;request_id:string;quote_id:string;requester_company_id:string;carrier_company_id:string;vehicle_id:string;agreed_amount:number;currency:string;status:string;payment_status:string;created_at:string;completed_at:string|null;dispute_reason:string|null};
type Payment={id:string;delivery_id:string;status:string;transfer_status:string;carrier_amount:number;commission_amount:number;buyer_total:number;payment_reference:string|null;transfer_error:string|null};
type TransferOrder={id:string;payment_id:string;delivery_id:string;attempt_no:number;priority:number;provider:string;transfer_fee:number;fee_payer:string;carrier_net_amount:number;platform_net_commission:number;status:string;provider_reference:string|null;failure_reason:string|null;requested_at:string};
type DeliveryEvent={id:string;delivery_id:string;event_type:string;old_status:string|null;new_status:string;provider_reference:string|null;created_at:string;sequence_no:number};
type Evidence={id:string;delivery_id:string;stage:string;evidence_type:string;original_name:string};

const money=(value:number)=>Number(value||0).toLocaleString("tr-TR",{style:"currency",currency:"TRY"});
const label=(value:string)=>value.replaceAll("_"," ");
const tone=(status:string):"neutral"|"violet"|"emerald"|"amber"|"red"|"blue"=>{
  if(["tamamlandi","serbest_birakildi","onaylandi","aktif"].includes(status))return "emerald";
  if(["hata","reddedildi","iptal","uyusmazlik"].includes(status))return "red";
  if(["isleniyor","tasimada","havuzda"].includes(status))return "blue";
  if(["emir_verildi","odeme_bekliyor","teslim_onaylandi","serbest_birakilmaya_hazir"].includes(status))return "amber";
  return "neutral";
};

export default function AdminLogisticsPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const[companies,setCompanies]=useState<Company[]>([]);
  const[vehicles,setVehicles]=useState<Vehicle[]>([]);
  const[caps,setCaps]=useState<Capability[]>([]);
  const[docs,setDocs]=useState<DocumentRow[]>([]);
  const[items,setItems]=useState<MarketItem[]>([]);
  const[deliveries,setDeliveries]=useState<Delivery[]>([]);
  const[payments,setPayments]=useState<Payment[]>([]);
  const[orders,setOrders]=useState<TransferOrder[]>([]);
  const[events,setEvents]=useState<DeliveryEvent[]>([]);
  const[evidence,setEvidence]=useState<Evidence[]>([]);
  const[query,setQuery]=useState("");
  const[busy,setBusy]=useState<string|null>(null);
  const[error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setError(null);
    const[v,c,d,l,r,co,de,p,o,e,ev]=await Promise.all([
      supabase.from("logistics_vehicles").select("id,company_id,plate,vehicle_type,brand_model,capacity,capacity_unit,status,admin_note,created_at").order("created_at",{ascending:false}),
      supabase.from("logistics_vehicle_capabilities").select("vehicle_id,capability"),
      supabase.from("logistics_vehicle_documents").select("id,vehicle_id,document_type,storage_path,original_name"),
      supabase.from("logistics_listings").select("id,title,status,created_at,company_id").order("created_at",{ascending:false}),
      supabase.from("logistics_requests").select("id,title,status,created_at,company_id").order("created_at",{ascending:false}),
      supabase.from("companies").select("id,name"),
      supabase.from("logistics_deliveries").select("id,request_id,quote_id,requester_company_id,carrier_company_id,vehicle_id,agreed_amount,currency,status,payment_status,created_at,completed_at,dispute_reason").order("created_at",{ascending:false}),
      supabase.from("logistics_payments").select("id,delivery_id,status,transfer_status,carrier_amount,commission_amount,buyer_total,payment_reference,transfer_error"),
      supabase.from("logistics_transfer_orders").select("id,payment_id,delivery_id,attempt_no,priority,provider,transfer_fee,fee_payer,carrier_net_amount,platform_net_commission,status,provider_reference,failure_reason,requested_at").order("attempt_no",{ascending:true}),
      supabase.from("logistics_delivery_events").select("id,delivery_id,event_type,old_status,new_status,provider_reference,created_at,sequence_no").order("sequence_no",{ascending:true}),
      supabase.from("logistics_delivery_evidence").select("id,delivery_id,stage,evidence_type,original_name"),
    ]);
    const loadError=v.error||c.error||d.error||l.error||r.error||co.error||de.error||p.error||o.error||e.error||ev.error;
    if(loadError){setError(loadError.message);return}
    setVehicles((v.data??[]) as Vehicle[]);
    setCaps((c.data??[]) as Capability[]);
    setDocs((d.data??[]) as DocumentRow[]);
    setCompanies((co.data??[]) as Company[]);
    setItems([...(l.data??[]).map(x=>({...x,kind:"listing" as const})),...(r.data??[]).map(x=>({...x,kind:"request" as const}))] as MarketItem[]);
    setDeliveries((de.data??[]) as Delivery[]);
    setPayments((p.data??[]) as Payment[]);
    setOrders((o.data??[]) as TransferOrder[]);
    setEvents((e.data??[]) as DeliveryEvent[]);
    setEvidence((ev.data??[]) as Evidence[]);
  },[supabase]);

  useEffect(()=>{void load()},[load]);
  const companyName=(id:string)=>companies.find(c=>c.id===id)?.name||"Şirket bilgisi yok";
  const requestTitle=(id:string)=>items.find(i=>i.kind==="request"&&i.id===id)?.title||"Nakliye dosyası";
  const paymentFor=(deliveryId:string)=>payments.find(p=>p.delivery_id===deliveryId);
  const ordersFor=(paymentId?:string)=>orders.filter(o=>o.payment_id===paymentId);
  const latestActive=(paymentId?:string)=>ordersFor(paymentId).filter(o=>["emir_verildi","isleniyor"].includes(o.status)).at(-1);

  const openDocument=async(path:string)=>{
    const result=await supabase.storage.from("logistics-documents").createSignedUrl(path,120);
    if(result.error){setError(result.error.message);return}
    window.open(result.data.signedUrl,"_blank","noopener,noreferrer");
  };
  const run=async(key:string,work:()=>PromiseLike<{error:{message:string}|null}>)=>{
    setBusy(key);setError(null);const result=await work();setBusy(null);
    if(result.error){setError(result.error.message);return}
    await load();
  };
  const reviewVehicle=(id:string,action:string)=>{
    const note=window.prompt("Yönetim notu (isteğe bağlı):")||null;
    return run(id,()=>supabase.rpc("admin_review_logistics_vehicle",{p_vehicle_id:id,p_action:action,p_note:note}));
  };
  const reviewItem=(item:MarketItem,action:string)=>{
    const note=window.prompt("Yönetim notu (isteğe bağlı):")||null;
    return run(item.id,()=>supabase.rpc("admin_review_logistics_market_item",{p_kind:item.kind,p_id:item.id,p_action:action,p_note:note}));
  };
  const holdPayment=(delivery:Delivery)=>{
    const reference=window.prompt("Havuz/dekont referansı:")||null;
    const note=window.prompt("Yönetim notu:")||null;
    return run(delivery.id,()=>supabase.rpc("admin_review_logistics_payment",{p_delivery_id:delivery.id,p_action:"havuz_onayla",p_reference:reference,p_note:note}));
  };
  const createTransfer=(payment:Payment)=>{
    const provider=window.prompt("Banka veya ödeme kuruluşu:","manuel")||"manuel";
    const fee=Number(window.prompt("Aktarım masrafı (₺):","0")||0);
    const payer=(window.prompt("Masraf tarafı: platform veya carrier","platform")||"platform").trim();
    const priority=Number(window.prompt("Öncelik (0–100):","50")||50);
    const note=window.prompt("Aktarım notu:")||null;
    return run(payment.id,()=>supabase.rpc("admin_create_logistics_transfer_order",{p_payment_id:payment.id,p_provider:provider,p_transfer_fee:fee,p_fee_payer:payer,p_priority:priority,p_note:note}));
  };
  const processTransfer=(payment:Payment,action:"isleme_al"|"tamamla"|"hata")=>{
    const reference=action==="hata"?null:window.prompt(action==="isleme_al"?"Takip referansı:":"Banka işlem referansı:")||null;
    const note=window.prompt(action==="hata"?"Hata açıklaması:":"İşlem notu:")||null;
    if(action==="hata"&&!note)return Promise.resolve();
    return run(payment.id,()=>supabase.rpc("admin_process_logistics_transfer",{p_payment_id:payment.id,p_action:action,p_reference:reference,p_note:note}));
  };

  const search=query.toLocaleLowerCase("tr-TR");
  const filteredVehicles=vehicles.filter(v=>`${v.plate} ${companyName(v.company_id)} ${v.vehicle_type}`.toLocaleLowerCase("tr-TR").includes(search));
  const filteredDeliveries=deliveries.filter(d=>`${requestTitle(d.request_id)} ${companyName(d.requester_company_id)} ${companyName(d.carrier_company_id)}`.toLocaleLowerCase("tr-TR").includes(search));
  const pendingVehicles=vehicles.filter(v=>v.status==="inceleme_bekliyor").length;
  const pendingItems=items.filter(i=>i.status==="inceleme_bekliyor").length;
  const escrowTotal=payments.filter(p=>p.status==="havuzda").reduce((n,p)=>n+Number(p.buyer_total||0),0);
  const failedTransfers=payments.filter(p=>p.transfer_status==="hata").length;

  return <PageShell>
    <PageHeader eyebrow="Lojistik operasyon ve finans" title="Nakliye Yönetimi" icon={Truck} tone="violet"
      description="Araç uygunluğunu, taşıma dosyalarını, güvenli havuzu ve nakliyeci aktarım sırasını tek merkezden yönetin."
      actions={<button onClick={()=>void load()} className="ui-button ui-button--secondary"><RefreshCw className="h-4 w-4"/>Yenile</button>}/>
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

    <AdminLogisticsDisputes/>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Araç incelemesi" value={pendingVehicles} helper="Onay bekleyen araç" tone="amber" icon={Truck}/>
      <MetricCard label="Pazar incelemesi" value={pendingItems} helper="İlan ve taşıma talebi" tone="violet" icon={ShieldCheck}/>
      <MetricCard label="Aktif taşıma" value={deliveries.filter(d=>!["tamamlandi","iptal"].includes(d.status)).length} helper="Devam eden dosya" tone="blue" icon={Clock3}/>
      <MetricCard label="Güvenli havuz" value={money(escrowTotal)} helper="Korunan alıcı ödemesi" tone="emerald" icon={Wallet}/>
      <MetricCard label="Aktarım hatası" value={failedTransfers} helper="Yeniden işlem gerekli" tone={failedTransfers?"red":"neutral"} icon={AlertTriangle}/>
    </div>

    <SurfaceCard><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} className="ui-input pl-10" placeholder="Firma, plaka, talep veya taşıma dosyası ara..."/></div></SurfaceCard>

    <div><h2 className="ui-section-title">Taşıma, ödeme ve aktarım dosyaları</h2><p className="ui-section-description">Karar vermek para gönderildiği anlamına gelmez; emir, işlenme ve banka sonucu ayrı ayrı izlenir.</p></div>
    <div className="space-y-5">
      {filteredDeliveries.map(delivery=>{
        const payment=paymentFor(delivery.id);
        const transferOrders=ordersFor(payment?.id);
        const activeOrder=latestActive(payment?.id);
        const fileEvents=events.filter(e=>e.delivery_id===delivery.id);
        const fileEvidence=evidence.filter(e=>e.delivery_id===delivery.id);
        return <SurfaceCard key={delivery.id} interactive>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(135px,.45fr))]">
            <div>
              <div className="flex flex-wrap gap-2"><StatusBadge tone={tone(delivery.status)}>{label(delivery.status)}</StatusBadge><StatusBadge tone={tone(payment?.transfer_status||"beklemede")}>Aktarım: {label(payment?.transfer_status||"beklemede")}</StatusBadge></div>
              <h3 className="mt-3 text-lg font-black text-slate-950">{requestTitle(delivery.request_id)}</h3>
              <p className="mt-1 text-sm text-slate-500">{companyName(delivery.requester_company_id)} → {companyName(delivery.carrier_company_id)}</p>
              <p className="mt-2 text-xs text-slate-500">{fileEvidence.length} kanıt · {fileEvents.length} olay · Dosya {delivery.id.slice(0,8).toUpperCase()}</p>
              {delivery.dispute_reason&&<p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{delivery.dispute_reason}</p>}
            </div>
            <Value label="Alıcı toplamı" value={money(payment?.buyer_total||delivery.agreed_amount)}/>
            <Value label="Nakliyeci alacağı" value={money(payment?.carrier_amount||delivery.agreed_amount)}/>
            <Value label="Platform komisyonu" value={money(payment?.commission_amount||0)}/>
          </div>

          {payment&&<div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {payment.status==="odeme_bekliyor"&&<button disabled={busy!==null} onClick={()=>void holdPayment(delivery)} className="ui-button ui-button--primary"><ShieldCheck className="h-4 w-4"/>Ödemeyi havuza al</button>}
            {delivery.status==="teslim_onaylandi"&&["beklemede","hata"].includes(payment.transfer_status)&&<button disabled={busy!==null} onClick={()=>void createTransfer(payment)} className="ui-button ui-button--primary"><Banknote className="h-4 w-4"/>Aktarım emri oluştur</button>}
            {activeOrder?.status==="emir_verildi"&&<button disabled={busy!==null} onClick={()=>void processTransfer(payment,"isleme_al")} className="ui-button ui-button--secondary">İşleme al</button>}
            {activeOrder?.status==="isleniyor"&&<><button disabled={busy!==null} onClick={()=>void processTransfer(payment,"tamamla")} className="ui-button ui-button--primary"><CheckCircle2 className="h-4 w-4"/>Aktarımı tamamla</button><button disabled={busy!==null} onClick={()=>void processTransfer(payment,"hata")} className="ui-button ui-button--danger"><XCircle className="h-4 w-4"/>Hata kaydet</button></>}
          </div>}

          {transferOrders.length>0&&<div className="mt-5 grid gap-3 lg:grid-cols-2">{transferOrders.map(order=><div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3"><p className="font-extrabold">{order.provider} · Deneme {order.attempt_no}</p><StatusBadge tone={tone(order.status)}>{label(order.status)}</StatusBadge></div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span>Masraf: <b>{money(order.transfer_fee)}</b></span><span>Ödeyen: <b>{order.fee_payer==="carrier"?"Nakliyeci":"Platform"}</b></span><span>Net ödeme: <b>{money(order.carrier_net_amount)}</b></span><span>Net komisyon: <b>{money(order.platform_net_commission)}</b></span></div>
            {order.provider_reference&&<p className="mt-2 text-xs font-semibold text-slate-600">{order.provider_reference}</p>}
            {order.failure_reason&&<p className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">{order.failure_reason}</p>}
          </div>)}</div>}

          {fileEvents.length>0&&<details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-extrabold">Değiştirilemez olay geçmişi ({fileEvents.length})</summary><div className="mt-4 space-y-3">{fileEvents.map(event=><div key={event.id} className="flex items-start gap-3 border-l-2 border-violet-200 pl-3"><span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black">#{event.sequence_no}</span><div><p className="text-sm font-bold">{label(event.event_type)}</p><p className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString("tr-TR")}{event.provider_reference?` · ${event.provider_reference}`:""}</p></div></div>)}</div></details>}
        </SurfaceCard>
      })}
      {!filteredDeliveries.length&&<EmptyState icon={Truck} title="Taşıma dosyası bulunamadı" description="Filtreye uygun operasyon veya ödeme kaydı yok."/>}
    </div>

    <div><h2 className="ui-section-title">Araç ve belge incelemeleri</h2><p className="ui-section-description">Her araç, faaliyet onayından bağımsız olarak belge ve yetkinlik yönünden incelenir.</p></div>
    <div className="grid gap-4 xl:grid-cols-2">{filteredVehicles.map(vehicle=><SurfaceCard key={vehicle.id} interactive>
      <div className="flex justify-between gap-4"><div><p className="ui-eyebrow">{companyName(vehicle.company_id)}</p><h3 className="mt-1 text-xl font-black">{vehicle.plate}</h3><p className="text-sm text-slate-500">{label(vehicle.vehicle_type)} · {vehicle.brand_model||"—"} · {vehicle.capacity} {vehicle.capacity_unit}</p></div><StatusBadge tone={tone(vehicle.status)}>{label(vehicle.status)}</StatusBadge></div>
      <div className="mt-4 flex flex-wrap gap-2">{caps.filter(c=>c.vehicle_id===vehicle.id).map(c=><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700" key={c.capability}>{label(c.capability)}</span>)}</div>
      <div className="mt-4 flex flex-wrap gap-2">{docs.filter(d=>d.vehicle_id===vehicle.id).map(doc=><button type="button" onClick={()=>void openDocument(doc.storage_path)} key={doc.id} className="ui-button ui-button--secondary"><FileCheck2 className="h-4 w-4"/>{label(doc.document_type)}</button>)}</div>
      {vehicle.admin_note&&<p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">{vehicle.admin_note}</p>}
      <div className="mt-5 flex flex-wrap gap-2"><button disabled={busy!==null} onClick={()=>void reviewVehicle(vehicle.id,"onayla")} className="ui-button ui-button--primary">Onayla</button><button disabled={busy!==null} onClick={()=>void reviewVehicle(vehicle.id,"duzeltme")} className="ui-button ui-button--secondary">Düzeltme iste</button><button disabled={busy!==null} onClick={()=>void reviewVehicle(vehicle.id,"reddet")} className="ui-button ui-button--danger">Reddet</button></div>
    </SurfaceCard>)}</div>

    <div><h2 className="ui-section-title">Lojistik ilanları ve taşıma talepleri</h2><p className="ui-section-description">Yayınlanmadan önce firma, araç ve taşıma türü uyumunu kontrol edin.</p></div>
    <div className="space-y-3">{items.map(item=><SurfaceCard key={item.kind+item.id} interactive className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex gap-2"><StatusBadge tone={tone(item.status)}>{label(item.status)}</StatusBadge><StatusBadge tone="violet">{item.kind==="listing"?"Hizmet ilanı":"Taşıma talebi"}</StatusBadge></div><h3 className="mt-3 font-black">{item.title}</h3><p className="mt-1 text-sm text-slate-500">{companyName(item.company_id)} · {new Date(item.created_at).toLocaleString("tr-TR")}</p></div>{item.status==="inceleme_bekliyor"&&<div className="flex gap-2"><button disabled={busy!==null} onClick={()=>void reviewItem(item,"onayla")} className="ui-button ui-button--primary">Onayla ve yayınla</button><button disabled={busy!==null} onClick={()=>void reviewItem(item,"reddet")} className="ui-button ui-button--danger">Reddet</button></div>}</SurfaceCard>)}</div>
  </PageShell>;
}

function Value({label:caption,value}:{label:string;value:string}){return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{caption}</p><p className="mt-2 text-lg font-black text-slate-950">{value}</p></div>}
