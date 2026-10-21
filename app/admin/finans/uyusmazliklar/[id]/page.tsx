'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  FileClock,
  Landmark,
  RefreshCw,
  Scale,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, PageShell } from '@/components/ui/PlatformUI'

type Company = { name: string }
type Payment = {
  id: string
  buyer_total: number
  seller_amount: number
  commission_amount: number
  status: string
  transfer_status: string
  payment_reference: string | null
  refunded_at: string | null
  released_at: string | null
}
type Offer = {
  id: string
  product_title: string
  status: string
  offered_quantity: number
  unit: string
  buyer: Company | null
  seller: Company | null
  payment: Payment | Payment[] | null
}
type Dispute = {
  id: string
  trade_offer_id: string
  reason: string
  status: string
  admin_note: string | null
  created_at: string
  resolved_at: string | null
  offer: Offer | Offer[] | null
}
type Decision = {
  id: string
  buyer_total: number
  buyer_refund_amount: number
  seller_payout_amount: number
  platform_commission_amount: number
  decision_type: string
  reason: string
  status: string
  decided_at: string
  completed_at: string | null
}
type Order = {
  id: string
  settlement_kind: 'buyer_refund' | 'seller_payout'
  attempt_no: number
  priority: number
  provider: string
  gross_amount: number
  transfer_fee: number
  fee_payer: string
  net_amount: number
  status: string
  provider_reference: string | null
  failure_reason: string | null
  requested_at: string
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
}
type Event = {
  id: string
  event_type: string
  old_status: string | null
  new_status: string
  provider_reference: string | null
  detail: Record<string, unknown>
  created_at: string
  sequence_no: number
}
type Ledger = {
  id: string
  transaction_type: string
  direction: 'credit' | 'debit'
  amount: number
  description: string
  status: string
  created_at: string
}

const money = (value: number) =>
  Number(value || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })

const labels: Record<string, string> = {
  acik: 'İnceleme bekliyor',
  karar_verildi: 'Karar verildi',
  kapatildi: 'Dosya kapandı',
  aktarim_bekliyor: 'Aktarım bekliyor',
  aktarim_suruyor: 'Aktarım sürüyor',
  tamamlandi: 'Tamamlandı',
  emir_verildi: 'Emir verildi',
  isleniyor: 'İşleniyor',
  hata: 'Hatalı',
  buyer_refund: 'Alıcı iadesi',
  seller_payout: 'Satıcı ödemesi',
  purchase_expense: 'Havuz ödemesi',
  sale_income: 'Satış geliri',
  platform_commission: 'Platform komisyonu',
  transfer_fee: 'Aktarım masrafı',
}

const one = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null

export default function TradeDisputeDetailPage() {
  const params = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [ledger, setLedger] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!params.id) return
    setLoading(true)
    setError(null)

    const disputeResult = await supabase
      .from('trade_delivery_disputes')
      .select('id,trade_offer_id,reason,status,admin_note,created_at,resolved_at,offer:trade_offers!trade_delivery_disputes_trade_offer_id_fkey(id,product_title,status,offered_quantity,unit,buyer:companies!trade_offers_buyer_company_id_fkey(name),seller:companies!trade_offers_seller_company_id_fkey(name),payment:trade_payments(id,buyer_total,seller_amount,commission_amount,status,transfer_status,payment_reference,refunded_at,released_at))')
      .eq('id', params.id)
      .maybeSingle()

    if (disputeResult.error || !disputeResult.data) {
      setError(disputeResult.error?.message ?? 'Uyuşmazlık dosyası bulunamadı.')
      setLoading(false)
      return
    }

    const disputeRow = disputeResult.data as unknown as Dispute
    const decisionResult = await supabase
      .from('trade_dispute_decisions')
      .select('id,buyer_total,buyer_refund_amount,seller_payout_amount,platform_commission_amount,decision_type,reason,status,decided_at,completed_at')
      .eq('dispute_id', params.id)
      .maybeSingle()

    const decisionRow = (decisionResult.data ?? null) as Decision | null
    const [orderResult, eventResult, ledgerResult] = await Promise.all([
      decisionRow
        ? supabase.from('trade_dispute_settlement_orders').select('id,settlement_kind,attempt_no,priority,provider,gross_amount,transfer_fee,fee_payer,net_amount,status,provider_reference,failure_reason,requested_at,started_at,completed_at,failed_at').eq('decision_id', decisionRow.id).order('attempt_no')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('trade_dispute_events').select('id,event_type,old_status,new_status,provider_reference,detail,created_at,sequence_no').eq('dispute_id', params.id).order('sequence_no'),
      decisionRow
        ? supabase.from('wallet_transactions').select('id,transaction_type,direction,amount,description,status,created_at').eq('trade_dispute_decision_id', decisionRow.id).order('created_at')
        : Promise.resolve({ data: [], error: null }),
    ])

    const firstError = decisionResult.error || orderResult.error || eventResult.error || ledgerResult.error
    if (firstError) setError(firstError.message)

    setDispute(disputeRow)
    setDecision(decisionRow)
    setOrders((orderResult.data ?? []) as Order[])
    setEvents((eventResult.data ?? []) as Event[])
    setLedger((ledgerResult.data ?? []) as Ledger[])
    setLoading(false)
  }, [params.id, supabase])

  useEffect(() => { void load() }, [load])

  const offer = one(dispute?.offer)
  const payment = one(offer?.payment)
  const completedFees = orders
    .filter((order) => order.status === 'tamamlandi')
    .reduce((sum, order) => sum + Number(order.transfer_fee || 0), 0)

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="Finansal denetim dosyası"
          title={offer?.product_title ?? 'Ticari uyuşmazlık'}
          description="Karar, para dağılımı, aktarım denemeleri ve muhasebe kayıtlarının değiştirilemez denetim görünümü."
          icon={Scale}
          tone="violet"
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/finans/uyusmazliklar" className="ui-button ui-button--secondary">
                <ArrowLeft className="h-4 w-4" />Uyuşmazlıklara dön
              </Link>
              <button onClick={() => void load()} className="ui-button ui-button--secondary">
                <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />Yenile
              </button>
            </div>
          }
        />

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

        {dispute && (
          <>
            <section className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
              <div className="bg-gradient-to-r from-slate-950 via-violet-950 to-slate-900 p-6 text-white">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Status value={dispute.status} />
                    <h2 className="mt-3 text-2xl font-black">{offer?.product_title ?? 'Ticari uyuşmazlık'}</h2>
                    <p className="mt-1 text-sm text-slate-300">{one(offer?.buyer)?.name ?? '—'} → {one(offer?.seller)?.name ?? '—'}</p>
                  </div>
                  <div className="text-right text-xs text-slate-300">
                    <p>Dosya: {dispute.id}</p>
                    <p className="mt-1">Açılış: {new Date(dispute.created_at).toLocaleString('tr-TR')}</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
                <Info icon={Building2} title="Alıcı" value={one(offer?.buyer)?.name ?? '—'} />
                <Info icon={Building2} title="Satıcı" value={one(offer?.seller)?.name ?? '—'} />
                <Info icon={CreditCard} title="Teklif miktarı" value={offer ? Number(offer.offered_quantity).toLocaleString('tr-TR') + ' ' + offer.unit : '—'} />
                <Info icon={Landmark} title="Ödeme durumu" value={payment ? (labels[payment.status] ?? payment.status) : '—'} />
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <div className="space-y-5">
                <Panel title="Uyuşmazlık beyanı" icon={Scale}>
                  <p className="text-sm leading-7 text-slate-700">{dispute.reason}</p>
                  {dispute.admin_note && <p className="mt-3 rounded-xl bg-slate-100 p-3 text-xs text-slate-600"><strong>Yönetim notu:</strong> {dispute.admin_note}</p>}
                </Panel>

                <Panel title="Gerekçeli karar ve dağılım" icon={ShieldCheck}>
                  {decision ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Amount title="Havuz toplamı" value={money(decision.buyer_total)} />
                        <Amount title="Alıcı iadesi" value={money(decision.buyer_refund_amount)} />
                        <Amount title="Satıcı ödemesi" value={money(decision.seller_payout_amount)} />
                        <Amount title="Platform komisyonu" value={money(decision.platform_commission_amount)} />
                        <Amount title="Muhasebeleşen aktarım masrafı" value={money(completedFees)} />
                        <Amount title="Dağıtım dengesi" value={money(decision.buyer_refund_amount + decision.seller_payout_amount + decision.platform_commission_amount)} />
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-700">{decision.reason}</p>
                      <p className="mt-3 text-xs font-semibold text-slate-500">Karar: {new Date(decision.decided_at).toLocaleString('tr-TR')} · {labels[decision.status] ?? decision.status}</p>
                    </>
                  ) : <p className="text-sm text-slate-500">Bu dosya için henüz gerekçeli karar verilmedi.</p>}
                </Panel>
              </div>

              <Panel title="Aktarım denemeleri" icon={Landmark}>
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-slate-900">{labels[order.settlement_kind]} · Deneme {order.attempt_no}</p>
                          <p className="mt-1 text-xs text-slate-500">{order.provider} · Öncelik {order.priority}</p>
                        </div>
                        <Status value={order.status} />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <Amount title="Brüt" value={money(order.gross_amount)} />
                        <Amount title="Masraf" value={money(order.transfer_fee)} />
                        <Amount title="Net" value={money(order.net_amount)} />
                      </div>
                      <p className="mt-3 text-[11px] text-slate-500">Masraf tarafı: {order.fee_payer === 'platform' ? 'Platform' : 'Alıcı / satıcı'}</p>
                      {order.provider_reference && <p className="mt-1 text-[11px] font-bold text-blue-700">Referans: {order.provider_reference}</p>}
                      {order.failure_reason && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">{order.failure_reason}</p>}
                    </div>
                  ))}
                  {!orders.length && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-400">Henüz aktarım emri bulunmuyor.</p>}
                </div>
              </Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <Panel title="Cüzdan ve muhasebe kayıtları" icon={Wallet}>
                <div className="space-y-2">
                  {ledger.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border bg-slate-50 p-3">
                      <div><p className="text-xs font-bold text-slate-900">{labels[item.transaction_type] ?? item.transaction_type}</p><p className="mt-1 text-[11px] text-slate-500">{item.description}</p></div>
                      <p className={'whitespace-nowrap font-black ' + (item.direction === 'credit' ? 'text-emerald-700' : 'text-amber-700')}>{item.direction === 'credit' ? '+' : '−'} {money(item.amount)}</p>
                    </div>
                  ))}
                  {!ledger.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">Henüz muhasebeleşmiş hareket bulunmuyor.</p>}
                </div>
              </Panel>

              <Panel title="Değiştirilemez işlem zaman çizelgesi" icon={FileClock}>
                <div className="space-y-3">
                  {events.map((event) => (
                    <div key={event.id} className="relative rounded-xl border bg-white p-4 pl-12">
                      <span className="absolute left-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-700">#{event.sequence_no}</span>
                      <p className="text-xs font-black text-slate-900">{labels[event.new_status] ?? event.event_type}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{event.old_status ?? '—'} → {event.new_status} · {new Date(event.created_at).toLocaleString('tr-TR')}</p>
                      {event.provider_reference && <p className="mt-1 text-[11px] font-bold text-blue-700">{event.provider_reference}</p>}
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p>Bu görünüm karar, aktarım ve muhasebe kayıtlarını aynı dosyada birleştirir. Yönetim işlemleri Uyuşmazlık Merkezi üzerinden yapılır.</p>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Scale; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-4 flex items-center gap-2 font-black text-slate-900"><Icon className="h-5 w-5 text-violet-600" />{title}</h3>{children}</section>
}
function Info({ icon: Icon, title, value }: { icon: typeof Scale; title: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><Icon className="h-4 w-4 text-violet-600" /><p className="mt-3 text-[10px] font-bold uppercase text-slate-400">{title}</p><p className="mt-1 font-black text-slate-900">{value}</p></div>
}
function Amount({ title, value }: { title: string; value: string }) {
  return <div className="rounded-xl border bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-400">{title}</p><p className="mt-1 font-black text-slate-900">{value}</p></div>
}
function Status({ value }: { value: string }) {
  const color = value === 'tamamlandi' || value === 'kapatildi'
    ? 'bg-emerald-100 text-emerald-700'
    : value === 'hata' || value === 'acik'
      ? 'bg-red-100 text-red-700'
      : value === 'isleniyor' || value === 'karar_verildi'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-amber-100 text-amber-800'
  return <span className={'rounded-full px-2.5 py-1 text-[10px] font-extrabold ' + color}>{labels[value] ?? value}</span>
}
