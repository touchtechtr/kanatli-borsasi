'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CreditCard,
  Download,
  Factory,
  RefreshCw,
  Search,
  Scale,
  ShieldCheck,
  Undo2,
  Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { dispatchNotificationEmails } from '@/lib/dispatch-notification-emails'
import { PageHeader, PageShell } from '@/components/ui/PlatformUI'

type CompanyRef = { name: string } | null
type FinanceTab = 'trade' | 'slaughterhouse'

type TradePayment = {
  id: string
  trade_offer_id: string
  product_title: string
  seller_amount: number
  commission_amount: number
  buyer_total: number
  status: string
  payment_reference: string | null
  admin_note: string | null
  transfer_status: 'beklemede' | 'emir_verildi' | 'isleniyor' | 'tamamlandi' | 'hata'
  transfer_reference: string | null
  transfer_error: string | null
  transfer_requested_at: string | null
  transfer_started_at: string | null
  transfer_completed_at: string | null
  created_at: string
  buyer: CompanyRef
  seller: CompanyRef
  offer: {
    id: string
    delivery_confirmations: { party: 'seller' | 'buyer' }[]
    delivery_disputes: { status: string }[]
  } | null
  dispute_decisions:
    | {
        id: string
        dispute_id: string
        decision_type: 'tam_iade' | 'tam_satici' | 'kismi_paylasim'
        status: string
        buyer_refund_amount: number
        seller_payout_amount: number
        platform_commission_amount: number
        completed_at: string | null
        settlement_orders:
          | {
              status: string
              transfer_fee: number
            }[]
          | {
              status: string
              transfer_fee: number
            }
          | null
      }
    | {
        id: string
        dispute_id: string
        decision_type: 'tam_iade' | 'tam_satici' | 'kismi_paylasim'
        status: string
        buyer_refund_amount: number
        seller_payout_amount: number
        platform_commission_amount: number
        completed_at: string | null
        settlement_orders:
          | {
              status: string
              transfer_fee: number
            }[]
          | {
              status: string
              transfer_fee: number
            }
          | null
      }[]
    | null
}

type SlaughterhousePayment = {
  id: string
  delivery_id: string
  request_id: string
  product_title: string
  price_unit: 'kg_canli' | 'bas'
  unit_price: number
  billable_quantity: number
  seller_amount: number
  commission_rate: number
  commission_amount: number
  buyer_total: number
  status: string
  admin_note: string | null
  created_at: string
  released_at: string | null
  buyer: CompanyRef
  seller: CompanyRef
}

const tradeLabels: Record<string, string> = {
  odeme_bekliyor: 'Ödeme bekliyor',
  odendi_havuzda: 'Ödendi / havuzda',
  saticiya_aktarildi: 'Satıcıya aktarıldı',
  iade_edildi: 'İade edildi',
  iptal: 'İptal',
}

const disputeDecisionLabels: Record<string, string> = {
  tam_iade: 'Tam iade',
  tam_satici: 'Satıcı lehine',
  kismi_paylasim: 'Kısmi paylaşım',
}

const completedDecision = (row: TradePayment) => {
  const decisions = row.dispute_decisions
  if (!decisions) return null
  if (Array.isArray(decisions)) {
    return decisions.find((decision) => decision.status === 'tamamlandi') ?? null
  }
  return decisions.status === 'tamamlandi' ? decisions : null
}

const completedSettlementOrders = (row: TradePayment) => {
  const orders = completedDecision(row)?.settlement_orders
  if (!orders) return []
  return Array.isArray(orders) ? orders : [orders]
}

const tradeStatusLabel = (row: TradePayment) => {
  const decision = completedDecision(row)
  if (decision) {
    return 'Uyuşmazlıkla sonuçlandı · ' +
      (disputeDecisionLabels[decision.decision_type] ?? decision.decision_type)
  }
  return tradeLabels[row.status] ?? row.status
}

const settledSellerAmount = (row: TradePayment) =>
  Number(completedDecision(row)?.seller_payout_amount ?? row.seller_amount)

const settledCommissionAmount = (row: TradePayment) =>
  Number(completedDecision(row)?.platform_commission_amount ?? row.commission_amount)

const settledRefundAmount = (row: TradePayment) => {
  const decision = completedDecision(row)
  if (decision) return Number(decision.buyer_refund_amount || 0)
  return row.status === 'iade_edildi' ? Number(row.buyer_total) : 0
}

const slaughterhouseLabels: Record<string, string> = {
  serbest_birakilmaya_hazir: 'Serbest bırakılmaya hazır',
  serbest_birakildi: 'Satıcıya aktarıldı',
  uyusmazlikta: 'Uyuşmazlıkta',
  iade_edildi: 'Alıcıya iade edildi',
  iptal: 'İptal',
}

const money = (value: number) =>
  Number(value || 0).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  })

const dateInRange = (date: string, from: string, to: string) => {
  const day = date.slice(0, 10)
  return (!from || day >= from) && (!to || day <= to)
}

const csvCell = (value: unknown) =>
  '"' + String(value ?? '').replaceAll('"', '""') + '"'

export default function AdminFinancePage() {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<FinanceTab>('trade')
  const [tradeRows, setTradeRows] = useState<TradePayment[]>([])
  const [slaughterhouseRows, setSlaughterhouseRows] = useState<
    SlaughterhousePayment[]
  >([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('tumu')
  const [company, setCompany] = useState('tumu')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [tradeResult, slaughterhouseResult] = await Promise.all([
      supabase
        .from('trade_payments')
        .select(
          'id,trade_offer_id,product_title,seller_amount,commission_amount,buyer_total,status,payment_reference,admin_note,transfer_status,transfer_reference,transfer_error,transfer_requested_at,transfer_started_at,transfer_completed_at,created_at,buyer:companies!trade_payments_buyer_company_id_fkey(name),seller:companies!trade_payments_seller_company_id_fkey(name),offer:trade_offers!trade_payments_trade_offer_id_fkey(id,delivery_confirmations:trade_delivery_confirmations(party),delivery_disputes:trade_delivery_disputes(status)),dispute_decisions:trade_dispute_decisions(id,dispute_id,decision_type,status,buyer_refund_amount,seller_payout_amount,platform_commission_amount,completed_at,settlement_orders:trade_dispute_settlement_orders(status,transfer_fee))',
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('slaughterhouse_payments')
        .select(
          'id,delivery_id,request_id,product_title,price_unit,unit_price,billable_quantity,seller_amount,commission_rate,commission_amount,buyer_total,status,admin_note,created_at,released_at,buyer:companies!slaughterhouse_payments_buyer_company_id_fkey(name),seller:companies!slaughterhouse_payments_seller_company_id_fkey(name)',
        )
        .order('created_at', { ascending: false }),
    ])

    if (tradeResult.error) setError(tradeResult.error.message)
    else setTradeRows((tradeResult.data ?? []) as unknown as TradePayment[])

    if (slaughterhouseResult.error) {
      const slaughterhouseError = slaughterhouseResult.error.message
      setError((current) =>
        current ? current + ' · ' + slaughterhouseError : slaughterhouseError,
      )
    } else {
      setSlaughterhouseRows(
        (slaughterhouseResult.data ?? []) as unknown as SlaughterhousePayment[],
      )
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setStatus('tumu')
    setCompany('tumu')
    setQuery('')
    setDateFrom('')
    setDateTo('')
  }, [tab])

  const companyOptions = useMemo(() => {
    const source = tab === 'trade' ? tradeRows : slaughterhouseRows
    return Array.from(
      new Set(
        source.flatMap((row) => [
          row.buyer?.name ?? '',
          row.seller?.name ?? '',
        ]),
      ),
    )
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'tr-TR'))
  }, [tab, tradeRows, slaughterhouseRows])

  const filteredTrade = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR')
    return tradeRows.filter((row) => {
      const text =
        (row.product_title +
          ' ' +
          (row.buyer?.name ?? '') +
          ' ' +
          (row.seller?.name ?? '')).toLocaleLowerCase('tr-TR')
      const matchesCompany =
        company === 'tumu' ||
        row.buyer?.name === company ||
        row.seller?.name === company
      return (
        (status === 'tumu' || row.status === status) &&
        matchesCompany &&
        dateInRange(row.created_at, dateFrom, dateTo) &&
        (!normalized || text.includes(normalized))
      )
    })
  }, [tradeRows, query, status, company, dateFrom, dateTo])

  const filteredSlaughterhouse = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR')
    return slaughterhouseRows.filter((row) => {
      const text =
        (row.product_title +
          ' ' +
          (row.buyer?.name ?? '') +
          ' ' +
          (row.seller?.name ?? '')).toLocaleLowerCase('tr-TR')
      const matchesCompany =
        company === 'tumu' ||
        row.buyer?.name === company ||
        row.seller?.name === company
      return (
        (status === 'tumu' || row.status === status) &&
        matchesCompany &&
        dateInRange(row.created_at, dateFrom, dateTo) &&
        (!normalized || text.includes(normalized))
      )
    })
  }, [slaughterhouseRows, query, status, company, dateFrom, dateTo])

  const summary = useMemo(() => {
    if (tab === 'trade') {
      return {
        waiting: tradeRows
          .filter((row) => row.status === 'odeme_bekliyor')
          .reduce((sum, row) => sum + Number(row.buyer_total), 0),
        held: tradeRows
          .filter((row) => row.status === 'odendi_havuzda')
          .reduce((sum, row) => sum + Number(row.buyer_total), 0),
        released: tradeRows
          .filter((row) => row.status === 'saticiya_aktarildi')
          .reduce((sum, row) => sum + settledSellerAmount(row), 0),
        commission: tradeRows
          .filter((row) => row.status === 'saticiya_aktarildi')
          .reduce((sum, row) => sum + settledCommissionAmount(row), 0),
        refunded: tradeRows.reduce(
          (sum, row) => sum + settledRefundAmount(row),
          0,
        ),
        waitingCount: tradeRows.filter(
          (row) => row.status === 'odeme_bekliyor',
        ).length,
        heldCount: tradeRows.filter((row) => row.status === 'odendi_havuzda')
          .length,
      }
    }

    return {
      waiting: slaughterhouseRows
        .filter((row) => row.status === 'serbest_birakilmaya_hazir')
        .reduce((sum, row) => sum + Number(row.buyer_total), 0),
      held: slaughterhouseRows
        .filter((row) => row.status === 'uyusmazlikta')
        .reduce((sum, row) => sum + Number(row.buyer_total), 0),
      released: slaughterhouseRows
        .filter((row) => row.status === 'serbest_birakildi')
        .reduce((sum, row) => sum + Number(row.seller_amount), 0),
      commission: slaughterhouseRows
        .filter((row) => row.status === 'serbest_birakildi')
        .reduce((sum, row) => sum + Number(row.commission_amount), 0),
      refunded: slaughterhouseRows
        .filter((row) => row.status === 'iade_edildi')
        .reduce((sum, row) => sum + Number(row.buyer_total), 0),
      waitingCount: slaughterhouseRows.filter(
        (row) => row.status === 'serbest_birakilmaya_hazir',
      ).length,
      heldCount: slaughterhouseRows.filter(
        (row) => row.status === 'uyusmazlikta',
      ).length,
    }
  }, [tab, tradeRows, slaughterhouseRows])

  const reviewTrade = async (row: TradePayment, action: string) => {
    let reference: string | null = null
    let note = ''
    let provider = 'manuel'
    let transferFee = 0
    let feePayer = 'platform'
    let priority = 0

    if (action === 'saticiya_aktar') {
      provider = (prompt('Banka veya ödeme kuruluşu:', 'manuel') ?? '').trim()
      if (!provider) return
      const feeInput = (prompt('Banka/aktarım masrafı (₺):', '0') ?? '').trim().replace(',', '.')
      transferFee = Number(feeInput)
      if (!Number.isFinite(transferFee) || transferFee < 0) { setError('Geçerli bir aktarım masrafı girin.'); return }
      const payerInput = (prompt('Masrafı kim karşılayacak? platform veya seller', 'platform') ?? '').trim().toLocaleLowerCase('tr-TR')
      if (!['platform','seller'].includes(payerInput)) { setError('Masraf tarafı platform veya seller olmalıdır.'); return }
      feePayer = payerInput
      const priorityInput = (prompt('Ödeme önceliği (0–100):', '0') ?? '').trim()
      priority = Number(priorityInput)
      if (!Number.isInteger(priority) || priority < 0 || priority > 100) { setError('Öncelik 0–100 arasında olmalıdır.'); return }
      note = prompt('Aktarım emri notu (isteğe bağlı):') ?? ''
    } else {
      reference = action === 'odeme_onayla' ? (prompt('Ödeme/dekont referansı (isteğe bağlı):') ?? '') : null
      note = prompt(action === 'iade' ? 'İade açıklaması:' : 'Yönetim notu (isteğe bağlı):') ?? ''
      if (action === 'iade' && !note.trim()) return
    }

    setBusy(row.id)
    setError(null)
    const { error: reviewError } = action === 'saticiya_aktar'
      ? await supabase.rpc('admin_create_trade_transfer_order', {
          p_payment_id: row.id,
          p_provider: provider,
          p_transfer_fee: transferFee,
          p_fee_payer: feePayer,
          p_priority: priority,
          p_note: note,
        })
      : await supabase.rpc('admin_review_trade_payment', {
          p_payment_id: row.id,
          p_action: action,
          p_reference: reference,
          p_note: note,
        })

    if (reviewError) setError(reviewError.message)
    else {
      await dispatchNotificationEmails(supabase)
      await load()
    }
    setBusy(null)
  }

  const processTransfer = async (row: TradePayment, action: 'isleme_al' | 'tamamla' | 'hata') => {
    const reference = action === 'tamamla'
      ? (prompt('Banka veya ödeme kuruluşu işlem referansı:') ?? '').trim()
      : action === 'isleme_al'
        ? (prompt('Aktarım takip referansı (isteğe bağlı):') ?? '').trim()
        : ''
    if (action === 'tamamla' && !reference) return
    const note = action === 'hata'
      ? (prompt('Aktarım hatasını açıklayın:') ?? '').trim()
      : (prompt('Yönetim notu (isteğe bağlı):') ?? '').trim()
    if (action === 'hata' && !note) return

    setBusy(row.id)
    setError(null)
    const { error: processError } = await supabase.rpc('admin_process_trade_transfer', {
      p_payment_id: row.id,
      p_action: action,
      p_reference: reference || null,
      p_note: note || null,
    })
    if (processError) setError(processError.message)
    else {
      await dispatchNotificationEmails(supabase)
      await load()
    }
    setBusy(null)
  }

  const resetFilters = () => {
    setStatus('tumu')
    setCompany('tumu')
    setDateFrom('')
    setDateTo('')
    setQuery('')
  }

  const downloadCsv = () => {
    const header = [
      'Kaynak',
      'Başlık',
      'Alıcı',
      'Satıcı',
      'Durum',
      'Alıcı toplamı',
      'Satıcı alacağı',
      'Komisyon',
      'Tarih',
    ]

    const rows =
      tab === 'trade'
        ? filteredTrade.map((row) => [
            'Ticari teklif',
            row.product_title,
            row.buyer?.name ?? '',
            row.seller?.name ?? '',
            tradeStatusLabel(row),
            row.buyer_total,
            settledSellerAmount(row),
            settledCommissionAmount(row),
            row.created_at,
          ])
        : filteredSlaughterhouse.map((row) => [
            'Kesimhane alımı',
            row.product_title,
            row.buyer?.name ?? '',
            row.seller?.name ?? '',
            slaughterhouseLabels[row.status] ?? row.status,
            row.buyer_total,
            row.seller_amount,
            row.commission_amount,
            row.created_at,
          ])

    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(';'))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download =
      tab === 'trade'
        ? 'ticari-teklif-finanslari.csv'
        : 'kesimhane-alim-finanslari.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const visibleCount =
    tab === 'trade' ? filteredTrade.length : filteredSlaughterhouse.length
  const statusLabels =
    tab === 'trade' ? tradeLabels : slaughterhouseLabels

  return (
    <PageShell className="space-y-6">
        <PageHeader
          eyebrow="Finans yönetimi"
          title="Ödemeler ve Komisyonlar"
          description="Ticari teklifleri ve kesimhane alımlarını tek finans merkezinden izleyin."
          icon={Wallet}
          actions={
            <>
              <Link href="/admin/finans/aktarimlar" className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800">
                <Wallet className="h-4 w-4" />Aktarım Merkezi
              </Link>
              <Link href="/admin/finans/uyusmazliklar" className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-800">
                <Scale className="h-4 w-4" />Uyuşmazlık Merkezi
              </Link>
              <button onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold">
                <Download className="h-4 w-4" />CSV indir
              </button>
              <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
                <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />Yenile
              </button>
            </>
          }
        />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="ui-surface-card grid gap-3 p-2 sm:grid-cols-2">
          <button
            onClick={() => setTab('trade')}
            className={
              'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ' +
              (tab === 'trade'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50')
            }
          >
            <CreditCard className="h-5 w-5" />
            <span>
              <span className="block font-extrabold">Ticari Teklifler</span>
              <span className="block text-xs opacity-75">
                {tradeRows.length} finans kaydı
              </span>
            </span>
          </button>
          <button
            onClick={() => setTab('slaughterhouse')}
            className={
              'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ' +
              (tab === 'slaughterhouse'
                ? 'bg-rose-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50')
            }
          >
            <Factory className="h-5 w-5" />
            <span>
              <span className="block font-extrabold">Kesimhane İşlemleri</span>
              <span className="block text-xs opacity-75">
                {slaughterhouseRows.length} finans kaydı
              </span>
            </span>
          </button>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Card
            title={
              tab === 'trade' ? 'Ödeme bekleyen' : 'Serbest bırakılacak'
            }
            value={money(summary.waiting)}
            sub={summary.waitingCount + ' işlem'}
            tone="amber"
          />
          <Card
            title={tab === 'trade' ? 'Havuzda' : 'Uyuşmazlıkta'}
            value={money(summary.held)}
            sub={summary.heldCount + ' işlem'}
            tone={tab === 'trade' ? 'blue' : 'red'}
          />
          <Card
            title="Satıcıya aktarılan"
            value={money(summary.released)}
            sub="Net satıcı alacağı"
            tone="emerald"
          />
          <Card
            title="Platform komisyonu"
            value={money(summary.commission)}
            sub="Tamamlanan işlemler"
            tone="violet"
          />
          <Card
            title="İade edilen"
            value={money(summary.refunded)}
            sub="Alıcıya dönen tutar"
            tone="slate"
          />
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_210px_210px_160px_160px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Başlık, alıcı veya satıcı ara..."
                className="w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3 text-sm"
              />
            </div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-xl border px-3 text-sm"
            >
              <option value="tumu">Tüm durumlar</option>
              {Object.entries(statusLabels).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
            <select
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="rounded-xl border px-3 text-sm"
            >
              <option value="tumu">Tüm şirketler</option>
              {companyOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-xl border px-3 text-sm"
              aria-label="Başlangıç tarihi"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-xl border px-3 text-sm"
              aria-label="Bitiş tarihi"
            />
            <button
              onClick={resetFilters}
              className="rounded-xl border px-3 py-2.5 text-xs font-bold text-slate-600"
            >
              Temizle
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {visibleCount} kayıt gösteriliyor.
          </p>
        </section>

        <section className="space-y-3">
          {tab === 'trade'
            ? filteredTrade.map((row) => (
                <FinanceRow
                  key={row.id}
                  title={row.product_title}
                  buyer={row.buyer?.name}
                  seller={row.seller?.name}
                  status={row.status}
                  statusLabel={tradeStatusLabel(row)}
                  createdAt={row.created_at}
                  buyerTotal={row.buyer_total}
                  sellerAmount={completedDecision(row)?.seller_payout_amount ?? row.seller_amount}
                  commissionAmount={completedDecision(row)?.platform_commission_amount ?? row.commission_amount}
                  resolution={(() => {
                    const decision = completedDecision(row)
                    if (!decision) return null
                    const completedFee = completedSettlementOrders(row)
                      .filter((order) => order.status === 'tamamlandi')
                      .reduce((sum, order) => sum + Number(order.transfer_fee || 0), 0)
                    return (
                      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950">
                        <p className="font-extrabold">Uyuşmazlık dağılımı</p>
                        <div className="mt-2 grid gap-1 sm:grid-cols-2">
                          <span>Alıcı iadesi: <strong>{money(decision.buyer_refund_amount)}</strong></span>
                          <span>Satıcı ödemesi: <strong>{money(decision.seller_payout_amount)}</strong></span>
                          <span>Platform komisyonu: <strong>{money(decision.platform_commission_amount)}</strong></span>
                          <span>Muhasebeleşen aktarım masrafı: <strong>{money(completedFee)}</strong></span>
                        </div>
                        <Link href={'/admin/finans/uyusmazliklar/' + decision.dispute_id} className="mt-2 inline-block font-bold text-violet-700">
                          Uyuşmazlık dosyasını aç
                        </Link>
                      </div>
                    )
                  })()}
                  href={'/admin/teklifler/' + row.trade_offer_id}
                  hrefLabel="Teklifi görüntüle"
                  actions={
                    <div className="flex gap-2 lg:flex-col">
                      {row.status === 'odeme_bekliyor' && (
                        <>
                          <button
                            disabled={busy !== null}
                            onClick={() =>
                              void reviewTrade(row, 'odeme_onayla')
                            }
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            Ödemeyi onayla
                          </button>
                          <button
                            disabled={busy !== null}
                            onClick={() => void reviewTrade(row, 'iptal')}
                            className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50"
                          >
                            İptal
                          </button>
                        </>
                      )}
                      {row.status === 'odendi_havuzda' && (() => {
                        const sellerConfirmed = row.offer?.delivery_confirmations?.some((item) => item.party === 'seller') ?? false
                        const buyerConfirmed = row.offer?.delivery_confirmations?.some((item) => item.party === 'buyer') ?? false
                        const hasOpenDispute = row.offer?.delivery_disputes?.some((item) => item.status === 'acik') ?? false
                        return (
                          <>
                            <div className="grid grid-cols-2 gap-1 text-[10px] font-bold">
                              <span className={sellerConfirmed ? 'rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700' : 'rounded-lg bg-slate-100 px-2 py-1 text-slate-500'}>Satıcı {sellerConfirmed ? 'onaylı' : 'bekleniyor'}</span>
                              <span className={buyerConfirmed ? 'rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700' : 'rounded-lg bg-slate-100 px-2 py-1 text-slate-500'}>Alıcı {buyerConfirmed ? 'onaylı' : 'bekleniyor'}</span>
                            </div>
                            {sellerConfirmed && buyerConfirmed && !hasOpenDispute && row.transfer_status === 'beklemede' && (
                              <button
                                disabled={busy !== null}
                                onClick={() => void reviewTrade(row, 'saticiya_aktar')}
                                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                              >
                                Aktarım emri ver
                              </button>
                            )}
                            {row.transfer_status === 'emir_verildi' && (
                              <button disabled={busy !== null} onClick={() => void processTransfer(row, 'isleme_al')} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">İşleme al</button>
                            )}
                            {row.transfer_status === 'isleniyor' && (
                              <>
                                <span className="rounded-xl bg-blue-50 px-3 py-2 text-center text-xs font-bold text-blue-700">Aktarım işleniyor</span>
                                <button disabled={busy !== null} onClick={() => void processTransfer(row, 'tamamla')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Aktarımı tamamla</button>
                                <button disabled={busy !== null} onClick={() => void processTransfer(row, 'hata')} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">Hata kaydet</button>
                              </>
                            )}
                            {row.transfer_status === 'hata' && (
                              <>
                                <span className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700">{row.transfer_error || 'Aktarım hatası'}</span>
                                {sellerConfirmed && buyerConfirmed && !hasOpenDispute && <button disabled={busy !== null} onClick={() => void reviewTrade(row, 'saticiya_aktar')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Yeniden emir ver</button>}
                              </>
                            )}
                            {hasOpenDispute && <span className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700">Uyuşmazlık incelemede</span>}
                            <button
                              disabled={busy !== null}
                              onClick={() => void reviewTrade(row, 'iade')}
                              className="inline-flex items-center justify-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              İade et
                            </button>
                          </>
                        )
                      })()}
                    </div>
                  }
                />
              ))
            : filteredSlaughterhouse.map((row) => (
                <FinanceRow
                  key={row.id}
                  title={row.product_title}
                  buyer={row.buyer?.name}
                  seller={row.seller?.name}
                  status={row.status}
                  statusLabel={
                    slaughterhouseLabels[row.status] ?? row.status
                  }
                  createdAt={row.created_at}
                  buyerTotal={row.buyer_total}
                  sellerAmount={row.seller_amount}
                  commissionAmount={row.commission_amount}
                  href={
                    '/kesimhane/alim-merkezi/' + row.request_id
                  }
                  hrefLabel="Teslimat dosyasını aç"
                  detail={
                    Number(row.billable_quantity).toLocaleString('tr-TR') +
                    ' ' +
                    (row.price_unit === 'bas' ? 'baş' : 'kg') +
                    ' × ' +
                    money(row.unit_price)
                  }
                  actions={
                    row.status === 'serbest_birakilmaya_hazir' ||
                    row.status === 'uyusmazlikta' ? (
                      <Link
                        href="/admin/kesimhane-alimlari"
                        className="rounded-xl bg-rose-700 px-3 py-2 text-center text-xs font-bold text-white"
                      >
                        Yönetim dosyasına git
                      </Link>
                    ) : null
                  }
                />
              ))}

          {!loading && visibleCount === 0 && (
            <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-slate-400">
              <Wallet className="mx-auto mb-3 h-9 w-9" />
              Filtreye uygun finans kaydı bulunamadı.
            </div>
          )}
        </section>

        <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <p>
            Bu ekran platform içi muhasebe kayıtlarını gösterir. Gerçek banka
            transferi, lisanslı ödeme kuruluşu entegrasyonu tamamlandığında
            bağlanacaktır.
          </p>
        </div>    </PageShell>
  )
}

function FinanceRow({
  title,
  buyer,
  seller,
  status,
  statusLabel,
  createdAt,
  buyerTotal,
  sellerAmount,
  commissionAmount,
  href,
  hrefLabel,
  detail,
  resolution,
  actions,
}: {
  title: string
  buyer?: string
  seller?: string
  status: string
  statusLabel: string
  createdAt: string
  buyerTotal: number
  sellerAmount: number
  commissionAmount: number
  href: string
  hrefLabel: string
  detail?: string
  resolution?: React.ReactNode
  actions: React.ReactNode
}) {
  const tone =
    status === 'saticiya_aktarildi' || status === 'serbest_birakildi'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'odeme_bekliyor' ||
          status === 'serbest_birakilmaya_hazir'
        ? 'bg-amber-100 text-amber-800'
        : status === 'odendi_havuzda'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-red-100 text-red-700'

  return (
    <article className="ui-surface-card p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(130px,.5fr))_auto] lg:items-center">
        <div>
          <span
            className={
              'rounded-full px-2.5 py-1 text-[11px] font-extrabold ' + tone
            }
          >
            {statusLabel}
          </span>
          <h2 className="mt-3 font-extrabold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {buyer ?? '—'} → {seller ?? '—'} ·{' '}
            {new Date(createdAt).toLocaleString('tr-TR')}
          </p>
          {detail && (
            <p className="mt-2 text-xs font-semibold text-slate-600">
              Hesaplama: {detail}
            </p>
          )}
          {resolution}
          <Link
            href={href}
            className="mt-2 inline-block text-xs font-bold text-emerald-700"
          >
            {hrefLabel}
          </Link>
        </div>
        <Metric title="Alıcı toplamı" value={money(buyerTotal)} />
        <Metric title="Satıcı alacağı" value={money(sellerAmount)} />
        <Metric title="Komisyon" value={money(commissionAmount)} />
        <div>{actions}</div>
      </div>
    </article>
  )
}

function Card({
  title,
  value,
  sub,
  tone,
}: {
  title: string
  value: string
  sub: string
  tone: 'amber' | 'blue' | 'emerald' | 'violet' | 'red' | 'slate'
}) {
  const colors: Record<string, string> = {
    amber: 'border-amber-200 bg-amber-50',
    blue: 'border-blue-200 bg-blue-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    violet: 'border-violet-200 bg-violet-50',
    red: 'border-red-200 bg-red-50',
    slate: 'border-slate-200 bg-white',
  }

  return (
    <div className={'rounded-2xl border p-5 ' + colors[tone]}>
      <CreditCard className="h-5 w-5" />
      <p className="mt-3 text-xs font-bold uppercase text-slate-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-slate-400">
        {title}
      </p>
      <p className="mt-1 font-extrabold text-slate-800">{value}</p>
    </div>
  )
}
