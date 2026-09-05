'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Company = {
  id: string
  name: string
  role: string
  tax_no: string | null
  phone: string | null
  city: string | null
  status: 'beklemede' | 'onaylandi' | 'reddedildi'
  created_at: string
}

type FilterTab = 'beklemede' | 'onaylandi' | 'reddedildi' | 'hepsi'

const ROLE_LABELS: Record<string, string> = {
  ciftci: 'Çiftçi / Üretici',
  tuccar: 'Tüccar / Alıcı',
  tedarikci: 'Tedarikçi',
  entegre: 'Entegre Tesis',
}

const STATUS_BADGE: Record<Company['status'], { text: string; className: string }> = {
  beklemede: { text: 'Beklemede', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  onaylandi: { text: 'Onaylandı', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  reddedildi: { text: 'Reddedildi', className: 'bg-red-50 text-red-700 border-red-200' },
}

export default function AdminFirmaOnayPage() {
  const router = useRouter()
  const supabase = createClient()

  const [checkingAccess, setCheckingAccess] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeTab, setActiveTab] = useState<FilterTab>('beklemede')
  const [actionError, setActionError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    checkAccessAndLoad()
  }, [])

  const checkAccessAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push('/auth')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single()

    if (!profile?.is_admin) {
      setIsAdmin(false)
      setCheckingAccess(false)
      return
    }

    setIsAdmin(true)
    setCheckingAccess(false)
    await fetchCompanies()
  }

  const fetchCompanies = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setCompanies(data as Company[])
    }
    setLoading(false)
  }

  const handleStatusChange = async (
    companyId: string,
    newStatus: 'onaylandi' | 'reddedildi'
  ) => {
    setActionError(null)
    setProcessingId(companyId)

    const { error } = await supabase
      .from('companies')
      .update({ status: newStatus })
      .eq('id', companyId)

    if (error) {
      setActionError('İşlem başarısız: ' + error.message)
    } else {
      setCompanies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, status: newStatus } : c))
      )
    }
    setProcessingId(null)
  }

  const filteredCompanies =
    activeTab === 'hepsi'
      ? companies
      : companies.filter((c) => c.status === activeTab)

  const counts = {
    beklemede: companies.filter((c) => c.status === 'beklemede').length,
    onaylandi: companies.filter((c) => c.status === 'onaylandi').length,
    reddedildi: companies.filter((c) => c.status === 'reddedildi').length,
    hepsi: companies.length,
  }

  if (checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Kontrol ediliyor...
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
          <h1 className="text-lg font-bold text-slate-900 mb-2">Erişim Yetkiniz Yok</h1>
          <p className="text-sm text-slate-500">
            Bu sayfa sadece platform yöneticileri içindir.
          </p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h1 className="text-xl font-bold text-slate-900">Firma Onay Paneli</h1>
          <button
            onClick={() => router.push('/')}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ← Borsaya Dön
          </button>
        </div>

        <div className="flex gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          {(['beklemede', 'onaylandi', 'reddedildi', 'hepsi'] as FilterTab[]).map((tab) => (
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
            <div className="p-8 text-center text-sm text-slate-500">Yükleniyor...</div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Bu kategoride firma bulunmuyor.
            </div>
          ) : (
            filteredCompanies.map((company) => (
              <div key={company.id} className="p-5 flex flex-wrap items-center gap-4 justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900">{company.name}</p>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[company.status].className}`}
                    >
                      {STATUS_BADGE[company.status].text}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {ROLE_LABELS[company.role] || company.role}
                    {company.tax_no ? ` · Vergi No: ${company.tax_no}` : ''}
                    {company.city ? ` · ${company.city}` : ''}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Başvuru: {new Date(company.created_at).toLocaleDateString('tr-TR')}
                  </p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleStatusChange(company.id, 'onaylandi')}
                    disabled={company.status === 'onaylandi' || processingId === company.id}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => handleStatusChange(company.id, 'reddedildi')}
                    disabled={company.status === 'reddedildi' || processingId === company.id}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Reddet
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  )
}