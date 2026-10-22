'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2, Gavel, RefreshCw, Scale, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, PageShell } from '@/components/ui/PlatformUI'
import { dispatchNotificationEmails } from '@/lib/dispatch-notification-emails'

type Company={name:string}
type Offer={id:string;product_title:string;buyer_company_id:string;seller_company_id:string;buyer:Company|null;seller:Company|null;payment:{id:string;buyer_total:number;seller_amount:number;commission_amount:number;status:string}|null}
type Dispute={id:string;trade_offer_id:string;company_id:string;reason:string;status:string;admin_note:string|null;created_at:string;resolved_at:string|null;offer:Offer|null}
type Decision={id:string;dispute_id:string;buyer_total:number;buyer_refund_amount:number;seller_payout_amount:number;platform_commission_amount:number;decision_type:string;reason:string;status:string;decided_at:string;completed_at:string|null}
type Order={id:string;decision_id:string;settlement_kind:'buyer_refund'|'seller_payout';attempt_no:number;priority:number;provider:string;gross_amount:number;transfer_fee:number;fee_payer:'platform'|'recipient';net_amount:number;status:string;provider_reference:string|null;failure_reason:string|null;requested_at:string}
type Event={id:string;dispute_id:string;decision_id:string|null;settlement_order_id:string|null;event_type:string;old_status:string|null;new_status:string;provider_reference:string|null;detail:Record<string,unknown>;created_at:string;sequence_no:number}

const money=(value:number)=>Number(value||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'})
const statusLabels:Record<string,string>={acik:'İnceleme bekliyor',karar_verildi:'Karar verildi',aliciya_iade:'Alıcıya iade',saticiya_aktar:'Satıcıya aktarım',kismi_paylasim:'Kısmi paylaşım',kapatildi:'Dosya kapandı',aktarim_bekliyor:'Aktarım bekliyor',aktarim_suruyor:'Aktarım sürüyor',tamamlandi:'Tamamlandı',emir_verildi:'Emir verildi',isleniyor:'İşleniyor',hata:'Hatalı'}

export default function TradeDisputesPage(){
  const supabase=useMemo(()=>createClient(),[])
  const[disputes,setDisputes]=useState<Dispute[]>([])
  const[decisions,setDecisions]=useState<Decision[]>([])
  const[orders,setOrders]=useState<Order[]>([])
  const[events,setEvents]=useState<Event[]>([])
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState<string|null>(null)
  const[error,setError]=useState<string|null>(null)
  const[filter,setFilter]=useState('tumu')

  const load=useCallback(async()=>{
    setLoading(true);setError(null)
    const[d,dc,o,e]=await Promise.all([
      supabase.from('trade_delivery_disputes').select('id,trade_offer_id,company_id,reason,status,admin_note,created_at,resolved_at,offer:trade_offers!trade_delivery_disputes_trade_offer_id_fkey(id,product_title,buyer_company_id,seller_company_id,buyer:companies!trade_offers_buyer_company_id_fkey(name),seller:companies!trade_offers_seller_company_id_fkey(name),payment:trade_payments(id,buyer_total,seller_amount,commission_amount,status))').order('created_at',{ascending:false}),
      supabase.from('trade_dispute_decisions').select('*').order('decided_at',{ascending:false}),
      supabase.from('trade_dispute_settlement_orders').select('*').order('attempt_no',{ascending:true}),
      supabase.from('trade_dispute_events').select('*').order('sequence_no',{ascending:true}),
    ])
    const firstError=d.error||dc.error||o.error||e.error
    if(firstError)setError(firstError.message)
    else{
      setDisputes((d.data??[]) as unknown as Dispute[])
      setDecisions((dc.data??[]) as Decision[])
      setOrders((o.data??[]) as Order[])
      setEvents((e.data??[]) as Event[])
    }
    setLoading(false)
  },[supabase])

  useEffect(()=>{void load()},[load])

  const visible=disputes.filter(dispute=>{
    if(filter==='tumu')return true
    if(filter==='acik')return dispute.status==='acik'
    if(filter==='tamamlandi')return dispute.status==='kapatildi'
    const decision=decisions.find(item=>item.dispute_id===dispute.id)
    if(filter==='bekleyen')return decision?.status==='aktarim_bekliyor'
    if(filter==='suruyor')return decision?.status==='aktarim_suruyor'
    if(filter==='hata'){
      const decisionOrders=orders.filter(item=>item.decision_id===decision?.id)
      return decisionOrders.some(item=>item.status==='hata'&&!decisionOrders.some(completed=>completed.settlement_kind===item.settlement_kind&&completed.status==='tamamlandi'))
    }
    return true
  })
  const openCount=disputes.filter(d=>d.status==='acik').length
  const runningCount=decisions.filter(d=>['aktarim_bekliyor','aktarim_suruyor'].includes(d.status)).length
  const closedCount=disputes.filter(d=>d.status==='kapatildi').length

  const resolve=async(dispute:Dispute,refund:number,seller:number,commission:number,reason:string)=>{
    if(!reason.trim()||reason.trim().length<10){setError('Gerekçeli karar en az 10 karakter olmalıdır.');return}
    setBusy(dispute.id);setError(null)
    const{error:e}=await supabase.rpc('admin_resolve_trade_dispute',{p_dispute_id:dispute.id,p_buyer_refund:refund,p_seller_payout:seller,p_platform_commission:commission,p_reason:reason})
    if(e)setError(e.message);else{await dispatchNotificationEmails(supabase);await load()}
    setBusy(null)
  }

  const createOrder=async(decision:Decision,kind:'buyer_refund'|'seller_payout')=>{
    const provider=prompt('Banka veya ödeme kuruluşu:','Manuel banka transferi')
    if(provider===null)return
    const fee=Number(prompt('Aktarım masrafı (₺):','0')??'0')
    if(!Number.isFinite(fee)||fee<0){setError('Geçerli bir aktarım masrafı girin.');return}
    const feePayer=confirm('Masraf alıcı/satıcı tutarından düşülsün mü?\nTamam: Alıcı/Satıcı öder\nİptal: Platform öder')?'recipient':'platform'
    const priority=Number(prompt('Öncelik (0–100):','50')??'50')
    const note=prompt('Yönetim notu (isteğe bağlı):','')??''
    setBusy(decision.id+kind);setError(null)
    const{error:e}=await supabase.rpc('admin_create_dispute_settlement_order',{p_decision_id:decision.id,p_kind:kind,p_provider:provider,p_transfer_fee:fee,p_fee_payer:feePayer,p_priority:priority,p_note:note||null})
    if(e)setError(e.message);else{await dispatchNotificationEmails(supabase);await load()}
    setBusy(null)
  }

  const processOrder=async(order:Order,action:'isleme_al'|'tamamla'|'hata')=>{
    const reference=action==='hata'?'':prompt(action==='tamamla'?'Banka tamamlanma referansı:':'Banka takip referansı:',order.provider_reference??'')
    if(action!=='hata'&&reference===null)return
    const note=prompt(action==='hata'?'Hata açıklaması:':'İşlem notu (isteğe bağlı):','')
    if(note===null)return
    setBusy(order.id);setError(null)
    const{error:e}=await supabase.rpc('admin_process_dispute_settlement',{p_order_id:order.id,p_action:action,p_reference:reference||null,p_note:note||null})
    if(e)setError(e.message);else{await dispatchNotificationEmails(supabase);await load()}
    setBusy(null)
  }

  return <PageShell>
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow="Finans ve güvenli ticaret" title="Uyuşmazlık Merkezi" description="Havuzdaki parayı gerekçeli kararla paylaştırın; iade ve satıcı ödemelerini ayrı aktarım ayaklarıyla denetleyin." icon={Scale} tone="violet" actions={<div className="flex gap-2"><Link href="/admin/finans" className="ui-button ui-button--secondary"><ArrowLeft className="h-4 w-4"/>Finansa dön</Link><button onClick={()=>void load()} className="ui-button ui-button--secondary"><RefreshCw className={'h-4 w-4 '+(loading?'animate-spin':'')}/>Yenile</button></div>}/>

      {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <Summary title="Karar bekleyen" value={openCount} tone="red"/>
        <Summary title="Aktarımı süren" value={runningCount} tone="amber"/>
        <Summary title="Kapanan dosya" value={closedCount} tone="emerald"/>
      </section>

      <section className="flex flex-wrap gap-2 rounded-2xl border bg-white p-3">
        {[['tumu','Tüm dosyalar'],['acik','Karar bekleyen'],['bekleyen','Aktarım bekleyen'],['suruyor','Aktarımı süren'],['hata','Aktarım hatası'],['tamamlandi','Tamamlanan']].map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={'rounded-xl px-4 py-2 text-xs font-bold '+(filter===value?'bg-slate-950 text-white':'bg-slate-100 text-slate-600')}>{label}</button>)}
      </section>

      <section className="space-y-5">
        {visible.map(dispute=>{
          const decision=decisions.find(x=>x.dispute_id===dispute.id)
          const decisionOrders=orders.filter(x=>x.decision_id===decision?.id)
          const disputeEvents=events.filter(x=>x.dispute_id===dispute.id)
          return <article key={dispute.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b bg-gradient-to-r from-slate-950 via-violet-950 to-slate-900 p-6 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><Status value={dispute.status}/><h2 className="mt-3 text-xl font-black">{dispute.offer?.product_title??'Ticari uyuşmazlık'}</h2><p className="mt-1 text-sm text-slate-300">{dispute.offer?.buyer?.name??'—'} → {dispute.offer?.seller?.name??'—'}</p></div>
                <div className="text-right text-xs text-slate-300"><p>Dosya: {dispute.id.slice(0,8)}</p><p className="mt-1">{new Date(dispute.created_at).toLocaleString('tr-TR')}</p><Link href={'/admin/finans/uyusmazliklar/'+dispute.id} className="mt-3 inline-flex rounded-xl bg-white/10 px-3 py-2 font-bold text-white ring-1 ring-white/15 transition hover:bg-white/20">Denetim dosyasını aç</Link></div>
              </div>
            </div>

            <div className="grid gap-5 p-6 xl:grid-cols-[1.1fr_.9fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4"><p className="text-[10px] font-black uppercase text-red-500">Uyuşmazlık açıklaması</p><p className="mt-2 text-sm leading-6 text-red-900">{dispute.reason}</p></div>
                <div className="grid gap-3 sm:grid-cols-3"><Amount title="Havuz toplamı" value={money(dispute.offer?.payment?.buyer_total??0)}/><Amount title="Başlangıç satıcı alacağı" value={money(dispute.offer?.payment?.seller_amount??0)}/><Amount title="Başlangıç komisyonu" value={money(dispute.offer?.payment?.commission_amount??0)}/></div>
                {decision?<DecisionView decision={decision}/>:<DecisionForm dispute={dispute} busy={busy!==null} onSubmit={resolve}/>}
              </div>

              <div className="space-y-4">
                <h3 className="flex items-center gap-2 font-black text-slate-900"><Gavel className="h-5 w-5 text-violet-600"/>Aktarım ayakları</h3>
                {decision&&<>
                  {decision.buyer_refund_amount>0&&<SettlementLeg title="Alıcı iadesi" kind="buyer_refund" amount={decision.buyer_refund_amount} decision={decision} orders={decisionOrders.filter(x=>x.settlement_kind==='buyer_refund')} busy={busy} onCreate={createOrder} onProcess={processOrder}/>}
                  {decision.seller_payout_amount>0&&<SettlementLeg title="Satıcı ödemesi" kind="seller_payout" amount={decision.seller_payout_amount} decision={decision} orders={decisionOrders.filter(x=>x.settlement_kind==='seller_payout')} busy={busy} onCreate={createOrder} onProcess={processOrder}/>}
                  {decision.buyer_refund_amount===0&&decision.seller_payout_amount===0&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Dış aktarım gerektiren tutar bulunmuyor.</p>}
                </>}
                {!decision&&<p className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-400">Gerekçeli karar verildiğinde aktarım ayakları burada oluşur.</p>}
              </div>
            </div>

            <div className="border-t bg-slate-50 p-5"><h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Değiştirilemez olay geçmişi</h3><div className="mt-3 grid gap-2 md:grid-cols-3">{disputeEvents.map(event=><div key={event.id} className="rounded-xl border bg-white p-3"><div className="flex justify-between gap-2"><p className="text-xs font-bold">{statusLabels[event.new_status]??event.event_type}</p><span className="text-[10px] font-black text-slate-400">#{event.sequence_no}</span></div><p className="mt-1 text-[10px] text-slate-500">{new Date(event.created_at).toLocaleString('tr-TR')}</p>{event.provider_reference&&<p className="mt-1 text-[10px] font-bold text-blue-700">{event.provider_reference}</p>}</div>)}</div></div>
          </article>
        })}
        {!loading&&!visible.length&&<div className="rounded-3xl border border-dashed bg-white p-14 text-center text-slate-400"><CheckCircle2 className="mx-auto mb-3 h-10 w-10"/>Bu filtrede uyuşmazlık dosyası bulunmuyor.</div>}
      </section>

      <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"><ShieldCheck className="h-5 w-5 shrink-0"/><p>Karar vermek para gönderildiği anlamına gelmez. İade ve satıcı ödemesi ayrı emirlerle tamamlanır; dosya ancak gerekli bütün ayaklar başarıyla sonuçlandığında kapanır.</p></div>
    </div>
  </PageShell>
}

function DecisionForm({dispute,busy,onSubmit}:{dispute:Dispute;busy:boolean;onSubmit:(d:Dispute,r:number,s:number,c:number,n:string)=>void}){
  const total=Number(dispute.offer?.payment?.buyer_total??0)
  const[refund,setRefund]=useState(0);const[seller,setSeller]=useState(Number(dispute.offer?.payment?.seller_amount??0));const[commission,setCommission]=useState(Number(dispute.offer?.payment?.commission_amount??0));const[reason,setReason]=useState('')
  const sum=refund+seller+commission;const valid=Math.abs(sum-total)<0.01&&reason.trim().length>=10
  return <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4"><h3 className="font-black text-violet-950">Gerekçeli dağıtım kararı</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Alıcıya iade" value={refund} setValue={setRefund}/><Field label="Satıcı ödemesi" value={seller} setValue={setSeller}/><Field label="Platform komisyonu" value={commission} setValue={setCommission}/></div><div className={'mt-3 rounded-xl px-3 py-2 text-xs font-bold '+(Math.abs(sum-total)<0.01?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700')}>Dağıtım: {money(sum)} / Havuz: {money(total)}</div><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="Kanıtları ve karar gerekçesini açıklayın (en az 10 karakter)..." className="mt-3 w-full rounded-xl border bg-white p-3 text-sm"/><button disabled={busy||!valid} onClick={()=>onSubmit(dispute,refund,seller,commission,reason)} className="mt-3 w-full rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Kararı kaydet ve aktarım planını oluştur</button></div>
}

function DecisionView({decision}:{decision:Decision}){return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex justify-between gap-3"><div><p className="text-[10px] font-black uppercase text-emerald-600">Gerekçeli karar</p><h3 className="mt-1 font-black text-emerald-950">{statusLabels[decision.status]??decision.status}</h3></div><span className="text-xs font-bold text-emerald-700">{new Date(decision.decided_at).toLocaleString('tr-TR')}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><Amount title="Alıcı iadesi" value={money(decision.buyer_refund_amount)}/><Amount title="Satıcı ödemesi" value={money(decision.seller_payout_amount)}/><Amount title="Komisyon" value={money(decision.platform_commission_amount)}/></div><p className="mt-3 text-sm leading-6 text-emerald-900">{decision.reason}</p></div>}

function SettlementLeg({title,kind,amount,decision,orders,busy,onCreate,onProcess}:{title:string;kind:'buyer_refund'|'seller_payout';amount:number;decision:Decision;orders:Order[];busy:string|null;onCreate:(d:Decision,k:'buyer_refund'|'seller_payout')=>void;onProcess:(o:Order,a:'isleme_al'|'tamamla'|'hata')=>void}){
  const completed=orders.some(o=>o.status==='tamamlandi');const active=orders.find(o=>['emir_verildi','isleniyor'].includes(o.status))
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-900">{title}</p><p className="mt-1 text-lg font-black text-slate-950">{money(amount)}</p></div><Status value={completed?'tamamlandi':active?.status??(orders.some(o=>o.status==='hata')?'hata':'aktarim_bekliyor')}/></div><div className="mt-3 space-y-2">{orders.map(order=><div key={order.id} className="rounded-xl border bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold">{order.provider} · Deneme {order.attempt_no}</p><span className="text-[10px] font-bold text-slate-500">Net {money(order.net_amount)} · Masraf {money(order.transfer_fee)}</span></div><div className="mt-2 flex flex-wrap items-center gap-2"><Status value={order.status}/>{order.status==='tamamlandi'?<span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">Masraf muhasebeleştirildi</span>:order.status==='hata'?<span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-600">Masraf muhasebeleştirilmedi</span>:null}</div>{order.failure_reason&&<p className="mt-2 text-xs font-semibold text-red-700">{order.failure_reason}</p>}<div className="mt-2 flex flex-wrap gap-2">{order.status==='emir_verildi'&&<><button disabled={busy!==null} onClick={()=>onProcess(order,'isleme_al')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white">İşleme al</button><button disabled={busy!==null} onClick={()=>onProcess(order,'hata')} className="rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700">Hata kaydet</button></>}{order.status==='isleniyor'&&<><button disabled={busy!==null} onClick={()=>onProcess(order,'tamamla')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white">Tamamla</button><button disabled={busy!==null} onClick={()=>onProcess(order,'hata')} className="rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700">Hata kaydet</button></>}</div></div>)}</div>{!completed&&!active&&<button disabled={busy!==null} onClick={()=>onCreate(decision,kind)} className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-black text-white">{orders.some(o=>o.status==='hata')?'Yeniden aktarım emri ver':'Aktarım emri ver'}</button>}</div>
}

function Field({label,value,setValue}:{label:string;value:number;setValue:(v:number)=>void}){return <label className="text-xs font-bold text-slate-600">{label}<input type="number" min="0" step="0.01" value={value} onChange={e=>setValue(Number(e.target.value))} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label>}
function Amount({title,value}:{title:string;value:string}){return <div className="rounded-xl border bg-white/80 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">{title}</p><p className="mt-1 font-black text-slate-900">{value}</p></div>}
function Status({value}:{value:string}){const color=value==='tamamlandi'||value==='kapatildi'?'bg-emerald-100 text-emerald-700':value==='hata'||value==='acik'?'bg-red-100 text-red-700':value==='isleniyor'||value==='karar_verildi'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-800';return <span className={'rounded-full px-2.5 py-1 text-[10px] font-extrabold '+color}>{statusLabels[value]??value}</span>}
function Summary({title,value,tone}:{title:string;value:number;tone:'red'|'amber'|'emerald'}){const colors={red:'border-red-200 bg-red-50',amber:'border-amber-200 bg-amber-50',emerald:'border-emerald-200 bg-emerald-50'};return <div className={'rounded-2xl border p-5 '+colors[tone]}><p className="text-xs font-bold text-slate-600">{title}</p><p className="mt-2 text-3xl font-black">{value}</p></div>}
