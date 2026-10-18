'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PlatformUI'
import { COMPANY_ROLES, ROLE_LABELS } from '@/constants/company'

export default function CompanyProfilePage() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState('')
  const [company, setCompany] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', role: 'ciftci', city: 'Antalya', tax_no: '', phone: '', address: '', website: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.replace('/auth'); return }
    setUserId(user.id)
    const { data } = await supabase.from('companies').select('*').eq('user_id', user.id).maybeSingle()
    if (data) {
      setCompany(data)
      setForm({ name: data.name ?? '', role: data.role ?? 'ciftci', city: data.city ?? '', tax_no: data.tax_no ?? '', phone: data.phone ?? '', address: data.address ?? '', website: data.website ?? '' })
      const { data: rows } = await supabase.from('company_moderation_history').select('id, action, reason, created_at').eq('company_id', data.id).order('created_at', { ascending: false })
      setHistory(rows ?? [])
    }
    setLoading(false)
  }, [supabase])
  useEffect(() => { void load() }, [load])

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage(null)
    const { error } = await supabase.from('companies').upsert({ ...form, user_id: userId }, { onConflict: 'user_id' })
    setMessage(error ? `Kayıt başarısız: ${error.message}` : 'Şirket bilgileriniz güncellendi.')
    if (!error) await load(); setSaving(false)
  }

  const requestReview = async () => { setSaving(true); const { error } = await supabase.rpc('request_company_review'); setMessage(error ? error.message : 'Firma yeniden incelemeye gönderildi.'); if (!error) await load(); setSaving(false) }
  if (loading) return <div className="rounded-2xl bg-white p-10 text-center text-slate-500">Şirket bilgileri yükleniyor…</div>

  return <main className="ui-page-shell"><PageHeader eyebrow="Kurumsal kimlik ve iletişim" title="Şirket Bilgilerim" description="Şirket profilinizi, faaliyet rolünüzü ve iletişim bilgilerinizi güncel tutun." icon={Building2} tone="emerald" />{message && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</div>}<section className="grid gap-5 lg:grid-cols-[320px_1fr]"><aside className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Building2 className="h-6 w-6 text-emerald-600" /><h2 className="mt-3 text-lg font-bold text-slate-900">{company?.name ?? 'Yeni şirket profili'}</h2><p className="mt-1 text-sm text-slate-500">{company ? ROLE_LABELS[company.role as keyof typeof ROLE_LABELS] ?? company.role : 'Rol seçilmedi'}</p>{company && <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold ${company.status === 'onaylandi' ? 'bg-emerald-100 text-emerald-800' : company.status === 'reddedildi' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{company.status === 'onaylandi' ? 'Onaylı' : company.status === 'reddedildi' ? 'Reddedildi' : 'İncelemede'}</span>}{company?.status === 'reddedildi' && !company.is_permanently_blocked && <button disabled={saving} onClick={() => void requestReview()} className="mt-4 w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white">Yeniden incelemeye gönder</button>}</div>{history.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-900">Moderasyon geçmişi</h3><div className="mt-3 space-y-3">{history.map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-semibold text-slate-700">{item.action}</p><p className="mt-1 text-slate-500">{item.reason || 'Açıklama bulunmuyor.'}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('tr-TR')}</p></div>)}</div></div>}</aside><form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid gap-5 md:grid-cols-2"><Field label="Şirket / çiftlik unvanı"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field><Field label="Faaliyet rolü"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input">{COMPANY_ROLES.filter((role) => role.value !== 'admin').map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></Field><Field label="Telefon"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></Field><Field label="Şehir"><input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" /></Field><Field label="Vergi numarası"><input value={form.tax_no} onChange={(e) => setForm({ ...form, tax_no: e.target.value })} className="input" /></Field><Field label="Web sitesi"><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input" /></Field><div className="md:col-span-2"><Field label="Açık adres"><textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" /></Field></div></div><button disabled={saving} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Kaydediliyor…' : 'Bilgileri kaydet'}</button></form></section><style jsx>{`.input{width:100%;border:1px solid rgb(226 232 240);border-radius:.75rem;padding:.75rem;background:rgb(248 250 252);font-size:.875rem}`}</style></main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">{label}</span>{children}</label> }
