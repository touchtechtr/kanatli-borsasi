'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Building2, Clock3, RefreshCw, Search, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, PageShell } from '@/components/ui/PlatformUI'

type Order = {
  id: string
  payment_id: string
  trade_offer_id: string
  attempt_no: number
  priority: number
  provider: string
  currency: string
  buyer_total: number
  seller_gross_amount: number
  platform_gross_commission: number
  transfer_fee: number
  fee_payer: 'platform' | 'seller'
  seller_net_amount: number
  platform_net_commission: number
  status: string
  provider_reference: string | null
  failure_reason: string | null
  requested_at: string
  started_at: string | null
  completed_at: string | null
  payment: {
    product_title: string
    buyer: { name: string } | null
    seller: { name: string } | null
  } | null
  events: {
    id: string
    event_type: string
    sequence_no: number
    old_status: string | null
    new_status: string
    provider_reference: string | null
    detail: Record<string, unknown>
    created_at: string
  }[]
}

type Summary = {
  queued_count: number
  processing_count: number
  failed_count: number
  completed_count: number
  seller_gross_total: number
  seller_net_total: number
  gross_commission_total: number
  net_commission_total: number
  transfer_fee_total: number
}

const labels: Record<string,string> = {
  emir_verildi: 'Emir verildi',
  isleniyor: 'İşleniyor',
  tamamlandi: 'Tamamlandı',
  hata: 'Hatalı',
  iptal: 'İptal',
}

const money=(value:number)=>Number(value||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'})

export default function TransferCenterPage(){
  const supabase=useMemo(()=>createClient(),[])
  const [rows,setRows]=useState<Order[]>([])
  const [summary,setSummary]=useState<Summary|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null)
  const [status,setStatus]=useState('tumu')
  const [query,setQuery]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setError(null)
    const [ordersResult,summaryResult]=await Promise.all([
      supabase.from('trade_transfer_orders').select(
        'id,payment_id,trade_offer_id,attempt_no,priority,provider,currency,buyer_total,seller_gross_amount,platform_gross_commission,transfer_fee,fee_payer,seller_net_amount,platform_net_commission,status,provider_reference,failure_reason,requested_at,started_at,completed_at,payment:trade_payments!trade_transfer_orders_payment_id_fkey(product_title,buyer:companies!trade_payments_buyer_company_id_fkey(name),seller:companies!trade_payments_seller_company_id_fkey(name)),events:trade_transfer_events(id,sequence_no,event_type,old_status,new_status,provider_reference,detail,created_at)'
      ).order('priority',{ascending:false}).order('requested_at',{ascending:true}),
      supabase.rpc('admin_trade_transfer_summary'),
    ])
    if(ordersResult.error)setError(ordersResult.error.message)
    else setRows((ordersResult.data??[]) as unknown as Order[])
    if(summaryResult.error)setError((current)=>current?current+' · '+summaryResult.error.message:summaryResult.error.message)
    else setSummary(summaryResult.data as Summary)
    setLoading(false)
  },[supabase])

  useEffect(()=>{void load()},[load])

  const filtered=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('tr-TR')
    return rows.filter(row=>{
      const text=`${row.payment?.product_title??''} ${row.payment?.buyer?.name??''} ${row.payment?.seller?.name??''} ${row.provider} ${row.provider_reference??''}`.toLocaleLowerCase('tr-TR')
      return (status==='tumu'||row.status===status)&&(!q||text.includes(q))
    })
  },[rows,status,query])

  return <PageShell>
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow="Finans operasyonu" title="Aktarım Merkezi" description="Satıcı ödemelerini kuyruk, işlem, masraf, referans ve değiştirilemeyen olay geçmişiyle denetleyin." icon={WalletCards} tone="emerald" actions={<div className="flex gap-2"><Link href="/admin/finans" className="ui-button ui-button--secondary"><ArrowLeft className="h-4 w-4"/>Finansa dön</Link><button onClick={()=>void load()} className="ui-button ui-button--secondary"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Yenile</button></div>}/>

      {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Emir bekleyen" value={String(summary?.queued_count??0)} tone="amber"/>
        <Metric title="İşleniyor" value={String(summary?.processing_count??0)} tone="blue"/>
        <Metric title="Hatalı" value={String(summary?.failed_count??0)} tone="red"/>
        <Metric title="Satıcı net toplamı" value={money(summary?.seller_net_total??0)} tone="emerald"/>
        <Metric title="Banka/aktarım masrafı" value={money(summary?.transfer_fee_total??0)} tone="violet"/>
      </section>

      <section className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_220px]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="İşlem, firma, sağlayıcı veya referans ara..." className="w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3 text-sm"/></div>
        <select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-xl border px-3 text-sm"><option value="tumu">Tüm aktarım durumları</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      </section>

      <section className="space-y-4">
        {filtered.map((row,index)=>{
          const events=[...(row.events??[])].sort((a,b)=>Number(a.sequence_no)-Number(b.sequence_no))
          return <article key={row.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(120px,.55fr))]">
              <div><div className="flex flex-wrap items-center gap-2"><Status value={row.status}/><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Sıra {index+1}</span><span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">Öncelik {row.priority}</span></div><h2 className="mt-3 font-black text-slate-900">{row.payment?.product_title??'Ticari ödeme'}</h2><p className="mt-1 text-xs text-slate-500">{row.payment?.buyer?.name??'—'} → {row.payment?.seller?.name??'—'}</p><p className="mt-2 text-xs font-semibold text-slate-600">{row.provider} · Deneme {row.attempt_no}{row.provider_reference?' · '+row.provider_reference:''}</p><Link href={'/admin/teklifler/'+row.trade_offer_id} className="mt-3 inline-flex text-xs font-bold text-emerald-700">Teklif dosyasını aç</Link></div>
              <Amount title="Satıcı brüt" value={money(row.seller_gross_amount)}/>
              <Amount title="Aktarım masrafı" value={money(row.transfer_fee)} sub={row.fee_payer==='platform'?'Platform öder':'Satıcı öder'}/>
              <Amount title="Satıcı net" value={money(row.seller_net_amount)}/>
              <Amount title="Platform net komisyon" value={money(row.platform_net_commission)}/>
            </div>
            {row.failure_reason&&<div className="flex gap-2 border-t border-red-100 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700"><AlertTriangle className="h-4 w-4"/>{row.failure_reason}</div>}
            <div className="border-t bg-slate-50 px-5 py-4"><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Clock3 className="h-4 w-4"/>İşlem zaman çizelgesi</h3><div className="mt-3 grid gap-2 md:grid-cols-3">{events.map(event=><div key={event.id} className="rounded-xl border bg-white p-3"><p className="text-xs font-extrabold text-slate-800">{labels[event.new_status]??event.event_type}</p><p className="mt-1 text-[11px] text-slate-500">{new Date(event.created_at).toLocaleString('tr-TR')}</p>{event.provider_reference&&<p className="mt-1 text-[10px] font-bold text-blue-700">Ref: {event.provider_reference}</p>}</div>)}</div></div>
          </article>
        })}
        {!loading&&!filtered.length&&<div className="rounded-3xl border border-dashed bg-white p-14 text-center text-slate-400"><Building2 className="mx-auto mb-3 h-10 w-10"/>Filtreye uygun aktarım kaydı bulunamadı.</div>}
      </section>
    </div>
  </PageShell>
}

function Metric({title,value,tone}:{title:string;value:string;tone:string}){const colors:Record<string,string>={amber:'border-amber-200 bg-amber-50',blue:'border-blue-200 bg-blue-50',red:'border-red-200 bg-red-50',emerald:'border-emerald-200 bg-emerald-50',violet:'border-violet-200 bg-violet-50'};return <div className={`rounded-2xl border p-4 ${colors[tone]}`}><p className="text-xs font-bold text-slate-600">{title}</p><p className="mt-2 text-xl font-black text-slate-900">{value}</p></div>}
function Amount({title,value,sub}:{title:string;value:string;sub?:string}){return <div className="rounded-2xl border bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">{title}</p><p className="mt-2 text-sm font-black text-slate-900">{value}</p>{sub&&<p className="mt-1 text-[10px] text-slate-500">{sub}</p>}</div>}
function Status({value}:{value:string}){const color=value==='tamamlandi'?'bg-emerald-100 text-emerald-700':value==='hata'?'bg-red-100 text-red-700':value==='isleniyor'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-800';return <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${color}`}>{labels[value]??value}</span>}
