'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Company = {
  id: string
  user_id: string | null
  name: string
  role: string
  tax_no: string | null
  phone: string | null
  city: string | null
  status: 'beklemede' | 'onaylandi' | 'reddedildi'
  rejection_count: number
  last_rejection_reason: string | null
  blocked_until: string | null
  is_permanently_blocked: boolean
  created_at: string
}

interface RejectionHistory {
  id: string
  company_id: string
  reason: string | null
  created_at: string
}

type FilterTab = 'beklemede' | 'onaylandi' | 'reddedildi' | 'hepsi'

const ROLE_LABELS: Record<string, string> = {
  ciftci: 'Çiftçi / Üretici',
  tuccar: 'Tüccar / Alıcı',
  tedarikci: 'Tedarikçi',
  entegre: 'Entegre Tesis',
  uzman: 'Bağımsız Uzman / Veteriner',
}

const STATUS_BADGE: Record<
  Company['status'],
  { text: string; className: string }
> = {
  beklemede: {
    text: 'Beklemede',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  onaylandi: {
    text: 'Onaylandı',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  reddedildi: {
    text: 'Reddedildi',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
}

const REJECTION_REASONS = [
  'Bilgiler eksik',
  'Vergi veya kimlik bilgisi doğrulanamadı',
  'Firma bilgileri uyuşmuyor',
  'Şüpheli veya mükerrer hesap',
  'Platform kurallarına aykırı',
  'Diğer',
]

export default function AdminFirmaOnayPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [rejectionHistory, setRejectionHistory] = useState<RejectionHistory[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('beklemede')
  const [actionError, setActionError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [rejectingCompany, setRejectingCompany] =
    useState<Company | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    loadPage()
  }, [])

  const loadPage = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUserId(user?.id ?? null)
    await fetchCompanies()
  }

  const fetchCompanies = async () => {
    setLoading(true)
  
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })
  
    const { data: historyData, error: historyError } = await supabase
      .from('company_moderation_history')
      .select('id, company_id, reason, created_at')
      .eq('action', 'reddedildi')
      .order('created_at', { ascending: false })
  
    if (error) {
      setActionError('Firmalar yüklenemedi: ' + error.message)
    } else {
      setCompanies((data ?? []) as Company[])
    }
  
    if (historyError) {
      setActionError('Ret geçmişi yüklenemedi: ' + historyError.message)
    } else {
      setRejectionHistory((historyData ?? []) as RejectionHistory[])
    }
  
    setLoading(false)
  }

  const handleStatusChange = async (
    companyId: string,
    newStatus: 'onaylandi' | 'reddedildi',
    reason?: string
  ) => {
    setActionError(null)
    setProcessingId(companyId)

    const updateData:
      | {
          status: 'onaylandi'
        }
      | {
          status: 'reddedildi'
          last_rejection_reason: string
        } =
      newStatus === 'reddedildi'
        ? {
            status: 'reddedildi',
            last_rejection_reason: reason ?? '',
          }
        : {
            status: 'onaylandi',
          }

    const { error } = await supabase
      .from('companies')
      .update(updateData)
      .eq('id', companyId)

    if (error) {
      setActionError('İşlem başarısız: ' + error.message)
    } else {
      setRejectingCompany(null)
      setRejectionReason('')
      await fetchCompanies()
    }

    setProcessingId(null)
  }

  const submitRejection = async () => {
    if (!rejectingCompany || !rejectionReason) {
      setActionError('Firma reddetme nedeni seçilmelidir.')
      return
    }

    await handleStatusChange(
      rejectingCompany.id,
      'reddedildi',
      rejectionReason
    )
  }

  const filteredCompanies =
    activeTab === 'hepsi'
      ? companies
      : companies.filter((company) => company.status === activeTab)

  const counts = {
    beklemede: companies.filter(
      (company) => company.status === 'beklemede'
    ).length,
    onaylandi: companies.filter(
      (company) => company.status === 'onaylandi'
    ).length,
    reddedildi: companies.filter(
      (company) => company.status === 'reddedildi'
    ).length,
    hepsi: companies.length,
  }

  const isBlocked = (company: Company) => {
    if (company.is_permanently_blocked) return true
    if (!company.blocked_until) return false

    return new Date(company.blocked_until).getTime() > Date.now()
  }

  return (
    <main className="p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h1 className="text-xl font-bold text-slate-900">
            Firma Onay Paneli
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            Firma başvurularını inceleyin, onaylayın veya neden
            belirterek reddedin.
          </p>
        </div>

        <div className="flex gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          {(
            ['beklemede', 'onaylandi', 'reddedildi', 'hepsi'] as FilterTab[]
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab === 'beklemede' && `Beklemede (${counts.beklemede})`}
              {tab === 'onaylandi' && `Onaylandı (${counts.onaylandi})`}
              {tab === 'reddedildi' && `Reddedildi (${counts.reddedildi})`}
              {tab === 'hepsi' && `Hepsi (${counts.hepsi})`}
            </button>
          ))}
        </div>

        {actionError && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 text-sm text-red-700 rounded">
            {actionError}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Yükleniyor...
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Bu kategoride firma bulunmuyor.
            </div>
          ) : (
            filteredCompanies.map((company) => {
              const ownCompany = company.user_id === currentUserId
              const blocked = isBlocked(company)

              return (
                <div
                  key={company.id}
                  className="p-5 flex flex-wrap items-center gap-4 justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">
                        {company.name}
                      </p>

                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          STATUS_BADGE[company.status].className
                        }`}
                      >
                        {STATUS_BADGE[company.status].text}
                      </span>

                      {company.rejection_count > 0 && (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            company.rejection_count >= 5
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : company.rejection_count >= 3
                                ? 'bg-orange-100 text-orange-800 border-orange-300'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          ⚠ {company.rejection_count} Ret
                        </span>
                      )}

                      {blocked && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-red-100 text-red-800 border-red-300">
                          ⛔{' '}
                          {company.is_permanently_blocked
                            ? 'Kalıcı Engelli'
                            : 'Geçici Engelli'}
                        </span>
                      )}

                      {ownCompany && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                          Kendi Firmanız
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mt-1">
                      {ROLE_LABELS[company.role] || company.role}
                      {company.tax_no
                        ? ` · Vergi No: ${company.tax_no}`
                        : ''}
                      {company.city ? ` · ${company.city}` : ''}
                    </p>

                    <p className="text-xs text-slate-400 mt-0.5">
                      Başvuru:{' '}
                      {new Date(company.created_at).toLocaleDateString(
                        'tr-TR'
                      )}
                    </p>

                    {rejectionHistory.some(
  (item) => item.company_id === company.id
) && (
  <div className="mt-3 space-y-2">
    <p className="text-xs font-bold text-red-700">
      Ret geçmişi:
    </p>

    {rejectionHistory
      .filter((item) => item.company_id === company.id)
      .map((item, index) => (
        <div
          key={item.id}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"
        >
          <p className="text-xs font-medium text-red-700">
            {index + 1}. {item.reason || 'Ret nedeni belirtilmemiş.'}
          </p>

          <p className="mt-1 text-[11px] text-red-500">
            {new Date(item.created_at).toLocaleString('tr-TR')}
          </p>
        </div>
      ))}
  </div>
)}
                    {company.blocked_until &&
                      !company.is_permanently_blocked && (
                        <p className="text-xs text-red-500 mt-1">
                          Engel bitişi:{' '}
                          {new Date(
                            company.blocked_until
                          ).toLocaleString('tr-TR')}
                        </p>
                      )}
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() =>
                        handleStatusChange(company.id, 'onaylandi')
                      }
                      disabled={
                        ownCompany ||
                        blocked ||
                        company.status === 'onaylandi' ||
                        processingId === company.id
                      }
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Onayla
                    </button>

                    <button
                      onClick={() => {
                        setActionError(null)
                        setRejectionReason('')
                        setRejectingCompany(company)
                      }}
                      disabled={
                        ownCompany ||
                        company.status === 'reddedildi' ||
                        processingId === company.id
                      }
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Reddet
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {rejectingCompany && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-900">
              Firma Başvurusunu Reddet
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              <strong>{rejectingCompany.name}</strong> için ret nedeni
              seçin. Bu neden firma sahibine gösterilecektir.
            </p>

            <select
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full mt-5 border border-slate-200 rounded-xl p-3 text-sm bg-white"
            >
              <option value="">Ret nedeni seçin</option>

              {REJECTION_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setRejectingCompany(null)
                  setRejectionReason('')
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={submitRejection}
                disabled={
                  !rejectionReason ||
                  processingId === rejectingCompany.id
                }
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {processingId === rejectingCompany.id
                  ? 'İşleniyor...'
                  : 'Reddetmeyi Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}