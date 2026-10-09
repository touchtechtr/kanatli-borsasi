'use client'



import { useEffect, useMemo, useState } from 'react'

import Link from 'next/link'

import {

  CheckCircle2,

  Clock3,

  Inbox,

  Package,

  RefreshCw,

  XCircle,

} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'



type Company = {

  id: string

  name: string

  role: string

  status: 'beklemede' | 'onaylandi' | 'reddedildi'

}



type TradeOffer = {

  id: string

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

  status: 'beklemede' | 'kabul_edildi' | 'reddedildi' | 'tamamlandi'

  admin_status: 'beklemede' | 'onaylandi' | 'reddedildi'

  buyer_company_id: string

  seller_company_id: string

  created_at: string

  responded_at: string | null

  buyer_name?: string

}



const moneyFormatter = new Intl.NumberFormat('tr-TR', {

  style: 'currency',

  currency: 'TRY',

  minimumFractionDigits: 2,

})



const numberFormatter = new Intl.NumberFormat('tr-TR', {

  maximumFractionDigits: 2,

})



const STATUS_LABELS: Record<string, string> = {

  beklemede: 'Yanıt Bekliyor',

  kabul_edildi: 'Kabul Edildi',

  reddedildi: 'Reddedildi',

  iptal_edildi: 'Alıcı Tarafından İptal Edildi',

  tamamlandi: 'Tamamlandı',

}



const STATUS_CLASSES: Record<string, string> = {

  beklemede:

    'border-amber-200 bg-amber-50 text-amber-700',

  kabul_edildi:

    'border-emerald-200 bg-emerald-50 text-emerald-700',

  reddedildi:

    'border-red-200 bg-red-50 text-red-700',

  iptal_edildi:

    'border-slate-200 bg-slate-100 text-slate-600',

  tamamlandi:

    'border-blue-200 bg-blue-50 text-blue-700',

}



export default function CiftciPanelPage() {

  const supabase = createClient()



  const [company, setCompany] =

    useState<Company | null>(null)

  const [offers, setOffers] = useState<TradeOffer[]>([])

  const [loading, setLoading] = useState(true)

  const [processingId, setProcessingId] =

    useState<string | null>(null)

  const [pageError, setPageError] =

    useState<string | null>(null)



  useEffect(() => {

    loadPage()

  }, [])



  const loadPage = async () => {

    setLoading(true)

    setPageError(null)



    const {

      data: { user },

      error: userError,

    } = await supabase.auth.getUser()



    if (userError || !user) {

      window.location.replace('/auth')

      return

    }



    const { data: companyData, error: companyError } =

      await supabase

        .from('companies')

        .select('id, name, role, status')

        .eq('user_id', user.id)

        .maybeSingle()



    if (companyError) {

      setPageError(

        'Firma bilgileri yüklenemedi: ' +

          companyError.message

      )

      setLoading(false)

      return

    }



    if (!companyData) {

      setCompany(null)

      setOffers([])

      setLoading(false)

      return

    }



    const currentCompany = companyData as Company

    setCompany(currentCompany)



    const { data: offerData, error: offerError } =

      await supabase

        .from('trade_offers')

        .select(

          `

          id,

          product_title,

          offered_quantity,

          unit,

          seller_unit_price,

          commission_rate,

          commission_unit_amount,

          buyer_unit_price,

          subtotal_amount,

          commission_amount,

          total_amount,

          message,

          status,

          admin_status,

          buyer_company_id,

          seller_company_id,

          created_at,

          responded_at

        `

        )

        .eq('seller_company_id', currentCompany.id)

        .eq('admin_status', 'onaylandi')

        .order('created_at', { ascending: false })



    if (offerError) {

      setPageError(

        'Teklifler yüklenemedi: ' + offerError.message

      )

      setOffers([])

      setLoading(false)

      return

    }



    const buyerIds = [

      ...new Set(

        (offerData ?? []).map(

          (offer) => offer.buyer_company_id

        )

      ),

    ]



    const { data: buyerCompanies, error: buyerError } =

      buyerIds.length > 0

        ? await supabase

            .from('public_companies')

            .select('id, name')

            .in('id', buyerIds)

        : { data: [], error: null }



    if (buyerError) {

      setPageError(

        'Alıcı firma bilgileri yüklenemedi: ' +

          buyerError.message

      )

    }



    const buyerMap = new Map(

      (buyerCompanies ?? []).map((buyer) => [

        buyer.id,

        buyer.name,

      ])

    )



    const preparedOffers = (offerData ?? []).map(

      (offer) => ({

        ...offer,

        buyer_name:

          buyerMap.get(offer.buyer_company_id) ??

          'Firma bilgisi gizli',

      })

    )



    setOffers(preparedOffers as TradeOffer[])

    setLoading(false)

  }



  const handleOfferResponse = async (

    offer: TradeOffer,

    nextStatus: 'kabul_edildi' | 'reddedildi' | 'tamamlandi'

  ) => {

    const actionText =

      nextStatus === 'kabul_edildi'

        ? 'kabul etmek'

        : nextStatus === 'tamamlandi'

          ? 'tamamlandı olarak işaretlemek'

          : 'reddetmek'



    const expectedStatus =

      nextStatus === 'tamamlandi'

        ? 'kabul_edildi'

        : 'beklemede'

    const confirmed = window.confirm(

      `${offer.product_title} ürünü için gelen teklifi ${actionText} istediğinizden emin misiniz?`

    )



    if (!confirmed) return



    setProcessingId(offer.id)

    setPageError(null)



    const { data, error } = await supabase

      .from('trade_offers')

      .update({ status: nextStatus })

      .eq('id', offer.id)

      .eq('seller_company_id', company?.id ?? '')

      .eq('admin_status', 'onaylandi')

      .eq('status', expectedStatus)

      .select('id')

      .maybeSingle()



    if (error) {

      setPageError(

        'Teklif güncellenemedi: ' + error.message

      )

    } else if (!data) {

      setPageError(

        'Teklif daha önce işlenmiş veya işlem yetkiniz bulunmuyor.'

      )

    } else {

      window.location.reload()

      return

    }



    setProcessingId(null)

  }



  const waitingOffers = useMemo(

    () =>

      offers.filter(

        (offer) => offer.status === 'beklemede'

      ),

    [offers]

  )



  const acceptedOffers = useMemo(

    () =>

      offers.filter(

        (offer) =>

          offer.status === 'kabul_edildi' ||

          offer.status === 'tamamlandi'

      ),

    [offers]

  )



  if (loading) {

    return (

      <main className="min-h-screen bg-slate-50 flex items-center justify-center">

        <div className="flex items-center gap-3 text-sm text-slate-500">

          <RefreshCw className="h-5 w-5 animate-spin" />

          Teklifler yükleniyor...

        </div>

      </main>

    )

  }



  if (!company) {

    return (

      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">

        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">

          <Package className="mx-auto h-10 w-10 text-slate-400" />



          <h1 className="mt-4 text-xl font-bold text-slate-900">

            Firma Kaydı Bulunamadı

          </h1>



          <p className="mt-2 text-sm leading-6 text-slate-500">

            Çiftçi panelini kullanabilmek için önce firma

            bilgilerinizi oluşturmanız gerekiyor.

          </p>



          <Link

            href="/profil"

            className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"

          >

            Firma Profili Oluştur

          </Link>

        </div>

      </main>

    )

  }



  if (company.status !== 'onaylandi') {

    return (

      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">

        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">

          <Clock3 className="mx-auto h-10 w-10 text-amber-500" />



          <h1 className="mt-4 text-xl font-bold text-slate-900">

            Firma Onayı Gerekiyor

          </h1>



          <p className="mt-2 text-sm leading-6 text-slate-500">

            Gelen ticari teklifleri yönetebilmek için

            firmanızın yönetici tarafından onaylanması

            gerekiyor.

          </p>



          <Link

            href="/profil"

            className="mt-5 inline-flex rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"

          >

            Firma Profiline Git

          </Link>

        </div>

      </main>

    )

  }



  return (

    <main className="min-h-screen bg-slate-50 p-4 text-slate-800 md:p-8">

      <div className="mx-auto max-w-6xl space-y-6">

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">

                Satıcı teklif merkezi

              </p>



              <h1 className="mt-1 text-2xl font-bold text-slate-900">

                Gelen Ticari Teklifler

              </h1>



              <p className="mt-1 text-sm text-slate-500">

                {company.name} firmasına gönderilen ve

                yönetim tarafından incelenen teklifleri

                yönetin.

              </p>

            </div>



            <button

              type="button"

              onClick={loadPage}

              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"

            >

              <RefreshCw className="h-4 w-4" />

              Yenile

            </button>

          </div>

        </section>



        {pageError && (

          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">

            {pageError}

          </div>

        )}



        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">

          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">

            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">

              Yanıt bekleyen

            </p>

            <p className="mt-2 text-2xl font-bold text-amber-600">

              {waitingOffers.length}

            </p>

          </div>



          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">

            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">

              Kabul edilen

            </p>

            <p className="mt-2 text-2xl font-bold text-emerald-600">

              {acceptedOffers.length}

            </p>

          </div>



          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">

              Toplam teklif

            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">

              {offers.length}

            </p>

          </div>

        </section>



        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-5 py-4">

            <h2 className="flex items-center gap-2 font-bold text-slate-900">

              <Inbox className="h-5 w-5 text-emerald-600" />

              Teklif listesi

            </h2>

          </div>



          {offers.length === 0 ? (

            <div className="p-10 text-center">

              <Inbox className="mx-auto h-10 w-10 text-slate-300" />



              <h3 className="mt-3 font-semibold text-slate-800">

                Henüz gelen teklif bulunmuyor

              </h3>



              <p className="mt-1 text-sm text-slate-500">

                Yönetim tarafından onaylanan teklifler

                burada gösterilecektir.

              </p>

            </div>

          ) : (

            <div className="divide-y divide-slate-100">

              {offers.map((offer) => {

                const canRespond =

                  offer.status === 'beklemede'

                const canComplete =

                  offer.status === 'kabul_edildi'



                return (

                  <article

                    key={offer.id}

                    className="p-5 md:p-6"

                  >

                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

                      <div className="min-w-0">

                        <div className="flex flex-wrap items-center gap-2">

                          <h3 className="font-bold text-slate-900">

                            {offer.product_title}

                          </h3>



                          <span

                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${

                              STATUS_CLASSES[

                                offer.status

                              ] ??

                              STATUS_CLASSES.beklemede

                            }`}

                          >

                            {STATUS_LABELS[

                              offer.status

                            ] ?? offer.status}

                          </span>

                        </div>



                        <p className="mt-1 text-sm text-slate-500">

                          Alıcı firma:{' '}

                          <strong className="text-slate-700">

                            {offer.buyer_name}

                          </strong>

                        </p>



                        <p className="mt-1 text-xs text-slate-400">

                          Gönderim:{' '}

                          {new Date(

                            offer.created_at

                          ).toLocaleString('tr-TR')}

                        </p>

                      </div>



                      {canRespond && (

                        <div className="flex gap-2">

                          <button

                            type="button"

                            onClick={() =>

                              handleOfferResponse(

                                offer,

                                'reddedildi'

                              )

                            }

                            disabled={

                              processingId === offer.id

                            }

                            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"

                          >

                            <XCircle className="h-4 w-4" />

                            Reddet

                          </button>



                          <button

                            type="button"

                            onClick={() =>

                              handleOfferResponse(

                                offer,

                                'kabul_edildi'

                              )

                            }

                            disabled={

                              processingId === offer.id

                            }

                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"

                          >

                            <CheckCircle2 className="h-4 w-4" />

                            {processingId === offer.id

                              ? 'İşleniyor...'

                              : 'Kabul Et'}

                          </button>

                        </div>

                      )}

                      {canComplete && (

                        <button

                          type="button"

                          onClick={() =>

                            handleOfferResponse(

                              offer,

                              'tamamlandi'

                            )

                          }

                          disabled={

                            processingId === offer.id

                          }

                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"

                        >

                          <CheckCircle2 className="h-4 w-4" />

                          {processingId === offer.id

                            ? 'İşleniyor...'

                            : 'İşlemi Tamamla'}

                        </button>

                      )}

                    </div>



                    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">

                      <div className="rounded-xl bg-slate-50 p-3">

                        <p className="text-xs text-slate-500">

                          Teklif miktarı

                        </p>

                        <p className="mt-1 font-bold text-slate-900">

                          {numberFormatter.format(

                            offer.offered_quantity

                          )}{' '}

                          {offer.unit}

                        </p>

                      </div>



                      <div className="rounded-xl bg-slate-50 p-3">

                        <p className="text-xs text-slate-500">

                          Satıcı birim fiyatı

                        </p>

                        <p className="mt-1 font-bold text-slate-900">

                          {moneyFormatter.format(

                            offer.seller_unit_price

                          )}

                        </p>

                      </div>



                      <div className="rounded-xl bg-emerald-50 p-3">

                        <p className="text-xs text-emerald-700">

                          Size ödenecek

                        </p>

                        <p className="mt-1 font-bold text-emerald-800">

                          {moneyFormatter.format(

                            offer.subtotal_amount

                          )}

                        </p>

                      </div>



                      <div className="rounded-xl bg-blue-50 p-3">

                        <p className="text-xs text-blue-700">

                          Alıcı toplamı

                        </p>

                        <p className="mt-1 font-bold text-blue-800">

                          {moneyFormatter.format(

                            offer.total_amount

                          )}

                        </p>

                      </div>

                    </div>



                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">

                      <div className="rounded-xl border border-slate-200 p-3">

                        <p className="text-xs text-slate-500">

                          Komisyon oranı

                        </p>

                        <p className="mt-1 text-sm font-semibold text-slate-800">

                          %{numberFormatter.format(

                            offer.commission_rate

                          )}

                        </p>

                      </div>



                      <div className="rounded-xl border border-slate-200 p-3">

                        <p className="text-xs text-slate-500">

                          Birim komisyon

                        </p>

                        <p className="mt-1 text-sm font-semibold text-slate-800">

                          {moneyFormatter.format(

                            offer.commission_unit_amount

                          )}

                        </p>

                      </div>



                      <div className="col-span-2 rounded-xl border border-slate-200 p-3 md:col-span-1">

                        <p className="text-xs text-slate-500">

                          Toplam komisyon

                        </p>

                        <p className="mt-1 text-sm font-semibold text-slate-800">

                          {moneyFormatter.format(

                            offer.commission_amount

                          )}

                        </p>

                      </div>

                    </div>



                    {offer.message && (

                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">

                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">

                          Alıcının mesajı

                        </p>



                        <p className="mt-1 text-sm leading-6 text-slate-700">

                          {offer.message}

                        </p>

                      </div>

                    )}

                  </article>

                )

              })}

            </div>

          )}

        </section>

      </div>

    </main>

  )

}
