'use client'



import {

  useCallback,

  useEffect,

  useMemo,

  useState,

} from 'react'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

import {

  BadgePercent,

  ChevronDown,

  Download,

  ExternalLink,

  Clock3,

  RefreshCw,

  Search,

  ShieldCheck,

} from 'lucide-react'



type AdminStatus = 'beklemede' | 'onaylandi' | 'reddedildi'

type OfferStatus =

  | 'beklemede'

  | 'kabul_edildi'

  | 'reddedildi'

  | 'iptal_edildi'

  | 'tamamlandi'



type TradeOffer = {

  id: string

  listing_kind: string

  listing_id: string

  buyer_company_id: string

  seller_company_id: string

  product_title: string

  offered_quantity: number

  unit: string

  seller_unit_price: number

  commission_rate: number

  commission_unit_amount: number

  buyer_unit_price: number

  subtotal_amount: number

  commission_amount: number

  total_amount: number

  message: string | null

  status: OfferStatus

  admin_status: AdminStatus

  admin_note: string | null

  admin_reviewed_at: string | null

  created_at: string

}



type CompanySummary = {

  id: string

  name: string

  role: string

}



const money = new Intl.NumberFormat('tr-TR', {

  style: 'currency',

  currency: 'TRY',

  minimumFractionDigits: 2,

})



const number = new Intl.NumberFormat('tr-TR', {

  maximumFractionDigits: 2,

})



const ADMIN_BADGES: Record<

  AdminStatus,

  { label: string; className: string }

> = {

  beklemede: {

    label: 'Admin onayı bekliyor',

    className: 'border-amber-200 bg-amber-50 text-amber-700',

  },

  onaylandi: {

    label: 'Admin onayladı',

    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',

  },

  reddedildi: {

    label: 'Admin reddetti',

    className: 'border-red-200 bg-red-50 text-red-700',

  },

}



const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {

  beklemede: 'Satıcı yanıtı bekleniyor',

  kabul_edildi: 'Satıcı kabul etti',

  reddedildi: 'Reddedildi',

  iptal_edildi: 'Alıcı iptal etti',

  tamamlandi: 'İşlem tamamlandı',

}



export default function AdminTradeOffersPage() {

  const supabase = useMemo(() => createClient(), [])



  const [offers, setOffers] = useState<TradeOffer[]>([])

  const [companies, setCompanies] = useState<

    Record<string, CompanySummary>

  >({})

  const [filter, setFilter] = useState<AdminStatus | 'hepsi'>('beklemede')

  const [offerStatusFilter, setOfferStatusFilter] =

    useState<OfferStatus | 'hepsi'>('hepsi')

  const [searchTerm, setSearchTerm] = useState('')

  const [dateFrom, setDateFrom] = useState('')

  const [dateTo, setDateTo] = useState('')

  const [commissionRate, setCommissionRate] = useState('5')

  const [loading, setLoading] = useState(true)

  const [savingRate, setSavingRate] = useState(false)

  const [processingId, setProcessingId] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [success, setSuccess] = useState<string | null>(null)



  const fetchPage = useCallback(async () => {

    setLoading(true)

    setError(null)



    const [offerResult, settingResult] = await Promise.all([

      supabase

        .from('trade_offers')

        .select(

          'id, listing_kind, listing_id, buyer_company_id, seller_company_id, product_title, offered_quantity, unit, seller_unit_price, commission_rate, commission_unit_amount, buyer_unit_price, subtotal_amount, commission_amount, total_amount, message, status, admin_status, admin_note, admin_reviewed_at, created_at'

        )

        .order('created_at', { ascending: false }),

      supabase

        .from('platform_settings')

        .select('trade_commission_rate')

        .eq('id', true)

        .maybeSingle(),

    ])



    if (offerResult.error) {

      setError('Teklifler yüklenemedi: ' + offerResult.error.message)

      setOffers([])

      setLoading(false)

      return

    }



    const loadedOffers = (offerResult.data ?? []) as TradeOffer[]

    setOffers(loadedOffers)



    if (settingResult.error) {

      setError(

        'Komisyon ayarı yüklenemedi: ' + settingResult.error.message

      )

    } else if (settingResult.data) {

      setCommissionRate(

        String(settingResult.data.trade_commission_rate)

      )

    }



    const companyIds = [

      ...new Set(

        loadedOffers.flatMap((offer) => [

          offer.buyer_company_id,

          offer.seller_company_id,

        ])

      ),

    ]



    if (companyIds.length > 0) {

      const { data: companyData, error: companyError } = await supabase

        .from('companies')

        .select('id, name, role')

        .in('id', companyIds)



      if (companyError) {

        setError('Firma bilgileri yüklenemedi: ' + companyError.message)

      } else {

        setCompanies(

          Object.fromEntries(

            ((companyData ?? []) as CompanySummary[]).map((company) => [

              company.id,

              company,

            ])

          )

        )

      }

    } else {

      setCompanies({})

    }



    setLoading(false)

  }, [supabase])



  useEffect(() => {

    void fetchPage()

  }, [fetchPage])



  const saveCommissionRate = async () => {

    const parsedRate = Number(commissionRate.replace(',', '.'))



    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100) {

      setError('Komisyon oranı 0 ile 100 arasında olmalıdır.')

      return

    }



    setSavingRate(true)

    setError(null)

    setSuccess(null)



    const {

      data: { user },

    } = await supabase.auth.getUser()



    const { error: updateError } = await supabase

      .from('platform_settings')

      .update({

        trade_commission_rate: parsedRate,

        updated_at: new Date().toISOString(),

        updated_by: user?.id ?? null,

      })

      .eq('id', true)



    if (updateError) {

      setError('Komisyon oranı kaydedilemedi: ' + updateError.message)

    } else {

      setCommissionRate(String(parsedRate))

      setSuccess(

        `Komisyon oranı %${number.format(parsedRate)} olarak kaydedildi. Bu oran yalnızca yeni tekliflere uygulanacak.`

      )

    }



    setSavingRate(false)

  }



  const reviewOffer = async (

    offer: TradeOffer,

    nextStatus: 'onaylandi' | 'reddedildi'

  ) => {

    let note: string | null = null



    if (nextStatus === 'reddedildi') {

      const enteredNote = window.prompt(

        `${offer.product_title} teklifi için ret nedenini yazın:`

      )



      if (enteredNote === null) return



      note = enteredNote.trim()

      if (!note) {

        setError('Admin ret nedeni zorunludur.')

        return

      }

    } else {

      const confirmed = window.confirm(

        `${offer.product_title} teklifini satıcıya iletmek üzere onaylıyor musunuz?`

      )

      if (!confirmed) return

    }



    setProcessingId(offer.id)

    setError(null)

    setSuccess(null)



    const { error: updateError } = await supabase

      .from('trade_offers')

      .update({

        admin_status: nextStatus,

        admin_note: note,

      })

      .eq('id', offer.id)

      .eq('admin_status', 'beklemede')



    if (updateError) {

      setError('Teklif incelenemedi: ' + updateError.message)

    } else {

      setSuccess(

        nextStatus === 'onaylandi'

          ? 'Teklif onaylandı ve satıcının ekranına iletildi.'

          : 'Teklif admin tarafından reddedildi.'

      )

      await fetchPage()

    }



    setProcessingId(null)

  }



  const filteredOffers = useMemo(() => {

    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('tr-TR')

    return offers.filter((offer) => {

      const buyer = companies[offer.buyer_company_id]

      const seller = companies[offer.seller_company_id]

      const createdDate = offer.created_at.slice(0, 10)

      return (

        (filter === 'hepsi' || offer.admin_status === filter) &&

        (offerStatusFilter === 'hepsi' || offer.status === offerStatusFilter) &&

        (!normalizedSearch ||

          offer.product_title.toLocaleLowerCase('tr-TR').includes(normalizedSearch) ||

          (buyer?.name ?? '').toLocaleLowerCase('tr-TR').includes(normalizedSearch) ||

          (seller?.name ?? '').toLocaleLowerCase('tr-TR').includes(normalizedSearch)) &&

        (!dateFrom || createdDate >= dateFrom) &&

        (!dateTo || createdDate <= dateTo)

      )

    })

  }, [companies, dateFrom, dateTo, filter, offerStatusFilter, offers, searchTerm])

  const exportFilteredOffers = () => {

    if (filteredOffers.length === 0) {

      setError('Dışa aktarılacak teklif bulunmuyor.')

      return

    }

    const escapeCsv = (value: string | number | null) =>

      `"${String(value ?? '').replaceAll('"', '""')}"`

    const header = [

      'Teklif ID', 'Ürün', 'Alıcı', 'Satıcı', 'Miktar', 'Birim',

      'Satıcı Birim Fiyatı', 'Komisyon Oranı (%)', 'Komisyon Toplamı',

      'Alıcı Toplamı', 'Admin Durumu', 'Teklif Durumu', 'Admin Notu',

      'Oluşturulma Tarihi',

    ]

    const rows = filteredOffers.map((offer) => [

      offer.id,

      offer.product_title,

      companies[offer.buyer_company_id]?.name ?? 'Bilinmeyen firma',

      companies[offer.seller_company_id]?.name ?? 'Bilinmeyen firma',

      offer.offered_quantity,

      offer.unit,

      offer.seller_unit_price,

      offer.commission_rate,

      offer.commission_amount,

      offer.total_amount,

      ADMIN_BADGES[offer.admin_status].label,

      OFFER_STATUS_LABELS[offer.status],

      offer.admin_note,

      new Date(offer.created_at).toLocaleString('tr-TR'),

    ])

    const csv = [header, ...rows]

      .map((row) => row.map((value) => escapeCsv(value)).join(';'))

      .join('\r\n')

    const blob = new Blob([`\uFEFF${csv}`], {

      type: 'text/csv;charset=utf-8;',

    })

    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')

    anchor.href = url

    anchor.download = `ticari-teklifler-${new Date().toISOString().slice(0, 10)}.csv`

    anchor.click()

    URL.revokeObjectURL(url)

  }



  const counts = {

    beklemede: offers.filter((offer) => offer.admin_status === 'beklemede')

      .length,

    onaylandi: offers.filter((offer) => offer.admin_status === 'onaylandi')

      .length,

    reddedildi: offers.filter((offer) => offer.admin_status === 'reddedildi')

      .length,

    hepsi: offers.length,

  }



  return (

    <main className="min-h-screen bg-slate-50 p-5 text-slate-800 md:p-10">

      <div className="mx-auto max-w-7xl space-y-6">

        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">

          <div>

            <div className="flex items-center gap-2 text-emerald-700">

              <ShieldCheck className="h-5 w-5" />

              <span className="text-xs font-bold uppercase tracking-wider">

                Güvenli ticaret denetimi

              </span>

            </div>

            <h1 className="mt-2 text-2xl font-bold text-slate-950">

              Ticari Teklifler

            </h1>

            <p className="mt-1 text-sm text-slate-500">

              Teklifleri satıcıya iletilmeden önce inceleyin ve platform

              komisyonunu takip edin.

            </p>

          </div>



          <button

            type="button"

            onClick={() => void fetchPage()}

            disabled={loading}

            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"

          >

            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />

            Yenile

          </button>

        </div>



        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">

          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">

            <div>

              <div className="flex items-center gap-2">

                <BadgePercent className="h-5 w-5 text-emerald-700" />

                <h2 className="font-bold text-slate-950">

                  Platform komisyon oranı

                </h2>

              </div>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">

                Değişiklik yalnızca bundan sonra oluşturulacak tekliflere

                uygulanır. Önceki tekliflerin kayıtlı komisyonu değişmez.

              </p>

            </div>



            <div className="flex items-end gap-3">

              <label className="block">

                <span className="mb-1 block text-xs font-semibold text-slate-600">

                  Komisyon (%)

                </span>

                <input

                  type="number"

                  min="0"

                  max="100"

                  step="0.01"

                  value={commissionRate}

                  onChange={(event) => setCommissionRate(event.target.value)}

                  className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"

                />

              </label>

              <button

                type="button"

                onClick={() => void saveCommissionRate()}

                disabled={savingRate}

                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"

              >

                {savingRate ? 'Kaydediliyor...' : 'Oranı Kaydet'}

              </button>

            </div>

          </div>

        </section>



        {error && (

          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">

            {error}

          </div>

        )}



        {success && (

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">

            {success}

          </div>

        )}



        <div className="flex flex-wrap gap-2">

          {(

            [

              ['beklemede', 'Beklemede'],

              ['onaylandi', 'Onaylandı'],

              ['reddedildi', 'Reddedildi'],

              ['hepsi', 'Hepsi'],

            ] as const

          ).map(([value, label]) => (

            <button

              key={value}

              type="button"

              onClick={() => setFilter(value)}

              className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${

                filter === value

                  ? 'border-slate-900 bg-slate-900 text-white'

                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'

              }`}

            >

              {label} ({counts[value]})

            </button>

          ))}

        </div>



        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_190px_160px_160px_auto]">

            <label className="relative block">

              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />

              <input

                type="search"

                value={searchTerm}

                onChange={(event) => setSearchTerm(event.target.value)}

                placeholder="Ürün, alıcı veya satıcı ara"

                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"

              />

            </label>

            <select

              value={offerStatusFilter}

              onChange={(event) =>

                setOfferStatusFilter(event.target.value as OfferStatus | 'hepsi')

              }

              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"

            >

              <option value="hepsi">Tüm işlem durumları</option>

              {Object.entries(OFFER_STATUS_LABELS).map(([value, label]) => (

                <option key={value} value={value}>{label}</option>

              ))}

            </select>

            <input

              type="date"

              value={dateFrom}

              onChange={(event) => setDateFrom(event.target.value)}

              title="Başlangıç tarihi"

              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"

            />

            <input

              type="date"

              value={dateTo}

              onChange={(event) => setDateTo(event.target.value)}

              title="Bitiş tarihi"

              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"

            />

            <button

              type="button"

              onClick={exportFilteredOffers}

              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"

            >

              <Download className="h-4 w-4" />

              CSV İndir ({filteredOffers.length})

            </button>

          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">

            <span>{filteredOffers.length} teklif gösteriliyor.</span>

            {(searchTerm || offerStatusFilter !== 'hepsi' || dateFrom || dateTo) && (

              <button

                type="button"

                onClick={() => {

                  setSearchTerm('')

                  setOfferStatusFilter('hepsi')

                  setDateFrom('')

                  setDateTo('')

                }}

                className="font-semibold text-emerald-700 hover:underline"

              >

                Ek filtreleri temizle

              </button>

            )}

          </div>

        </section>



        {loading ? (

          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">

            Teklifler yükleniyor...

          </div>

        ) : filteredOffers.length === 0 ? (

          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">

            <Clock3 className="mx-auto h-9 w-9 text-slate-300" />

            <h2 className="mt-3 font-bold text-slate-800">

              Bu kategoride teklif bulunmuyor

            </h2>

          </div>

        ) : (

          <div className="space-y-2">

            {filteredOffers.map((offer) => {

              const buyer = companies[offer.buyer_company_id]

              const seller = companies[offer.seller_company_id]

              const badge = ADMIN_BADGES[offer.admin_status]

              const expanded = expandedId === offer.id



              return (

                <article

                  key={offer.id}

                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"

                >

                  <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)\_minmax(0,1.25fr)\_0.65fr_0.9fr_1fr_auto] xl:items-center">

                    <div className="min-w-0">

                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">

                        Ürün

                      </p>

                      <p className="truncate text-sm font-semibold text-slate-900">

                        {offer.product_title}

                      </p>

                      <p className="mt-0.5 text-[10px] text-slate-400">

                        {new Date(offer.created_at).toLocaleString('tr-TR')}

                      </p>

                    </div>



                    <div className="min-w-0">

                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">

                        Alıcı → Satıcı

                      </p>

                      <p className="truncate text-xs font-semibold text-slate-800">

                        {buyer?.name ?? 'Bilinmeyen firma'}

                      </p>

                      <p className="truncate text-[11px] text-slate-400">

                        → {seller?.name ?? 'Bilinmeyen firma'}

                      </p>

                    </div>



                    <div>

                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">

                        Miktar

                      </p>

                      <p className="text-xs font-semibold text-slate-700">

                        {number.format(offer.offered_quantity)} {offer.unit}

                      </p>

                    </div>



                    <div>

                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">

                        Toplam / Komisyon

                      </p>

                      <p className="text-xs font-bold text-emerald-700">

                        {money.format(offer.total_amount)}

                      </p>

                      <p className="text-[10px] text-amber-700">

                        {money.format(offer.commission_amount)} · %{number.format(offer.commission_rate)}

                      </p>

                    </div>



                    <div className="min-w-0">

                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">

                        Durum

                      </p>

                      <span

                        className={`mt-0.5 inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}

                      >

                        {badge.label}

                      </span>

                      <p className="mt-0.5 truncate text-[10px] text-slate-400">

                        {OFFER_STATUS_LABELS[offer.status]}

                      </p>

                    </div>



                    <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">

                      {offer.admin_status === 'beklemede' &&

                        offer.status === 'beklemede' && (

                          <>

                            <button

                              type="button"

                              onClick={() => void reviewOffer(offer, 'onaylandi')}

                              disabled={processingId === offer.id}

                              className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"

                            >

                              Onayla

                            </button>

                            <button

                              type="button"

                              onClick={() => void reviewOffer(offer, 'reddedildi')}

                              disabled={processingId === offer.id}

                              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"

                            >

                              Reddet

                            </button>

                          </>

                        )}

                      <button

                        type="button"

                        onClick={() => setExpandedId(expanded ? null : offer.id)}

                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"

                      >

                        Detay

                        <ChevronDown

                          className={`h-3.5 w-3.5 transition-transform ${

                            expanded ? 'rotate-180' : ''

                          }`}

                        />

                      </button>

                      <Link

                        href={`/admin/teklifler/${offer.id}`}

                        className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"

                      >

                        Sayfayı aç

                        <ExternalLink className="h-3.5 w-3.5" />

                      </Link>

                    </div>

                  </div>



                  {expanded && (

                    <div className="border-t border-slate-200 bg-slate-50 p-3">

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">

                        <CompactMetric

                          label="Satıcı birim fiyatı"

                          value={money.format(offer.seller_unit_price)}

                        />

                        <CompactMetric

                          label="Birim komisyon"

                          value={`+ ${money.format(offer.commission_unit_amount)}`}

                          tone="amber"

                        />

                        <CompactMetric

                          label="Alıcı birim fiyatı"

                          value={money.format(offer.buyer_unit_price)}

                          tone="blue"

                        />

                        <CompactMetric

                          label="Satıcı toplamı"

                          value={money.format(offer.subtotal_amount)}

                        />

                        <CompactMetric

                          label="Toplam komisyon"

                          value={money.format(offer.commission_amount)}

                          tone="amber"

                        />

                        <CompactMetric

                          label="Alıcı toplamı"

                          value={money.format(offer.total_amount)}

                          tone="blue"

                        />

                      </div>



                      {(offer.message || offer.admin_note) && (

                        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">

                          {offer.message && (

                            <p><strong>Alıcı notu:</strong> {offer.message}</p>

                          )}

                          {offer.admin_note && (

                            <p className="mt-1 text-red-700"><strong>Admin notu:</strong> {offer.admin_note}</p>

                          )}

                        </div>

                      )}

                    </div>

                  )}

                </article>

              )

            })}

          </div>

        )}

      </div>

    </main>

  )

}



function CompactMetric({

  label,

  value,

  tone = 'slate',

}: {

  label: string

  value: string

  tone?: 'slate' | 'amber' | 'blue'

}) {

  const colors = {

    slate: 'text-slate-800',

    amber: 'text-amber-700',

    blue: 'text-blue-700',

  }



  return (

    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">

      <p className="text-[10px] font-bold uppercase leading-4 tracking-wide text-slate-400">

        {label}

      </p>

      <p className={`mt-1 break-words text-sm font-bold ${colors[tone]}`}>

        {value}

      </p>

    </div>

  )

}
