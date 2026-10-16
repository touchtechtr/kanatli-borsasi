"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2, Factory, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";
import { getCompanyOperationAccess } from "@/lib/company-operation-access";

type PurchaseAccess = {
  authenticated: boolean; allowed: boolean; is_platform_staff?: boolean;
  has_company?: boolean; company_id?: string; company_name?: string;
  company_status?: string; has_required_activity?: boolean;
  active_facility_count?: number; reason?: string | null;
};

const initial = {
  title: "", animal_type: "Kanatlı Hayvan", breed: "", quantity_required: "",
  min_live_weight: "", max_live_weight: "", price_model: "kapali_teklif",
  target_price: "", city: "Antalya", delivery_address: "", delivery_start: "",
  delivery_end: "", health_requirements: "", expert_required: false,
  transport_responsibility: "satici", payment_terms: "", description: "",
};
const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
const today = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return toDateInput(date); };
const latestDate = () => { const date = new Date(); date.setFullYear(date.getFullYear() + 2); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return toDateInput(date); };

export default function NewRequest() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [access, setAccess] = useState<PurchaseAccess | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minDate = today();
  const maxDate = latestDate();
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let mounted = true;
    const checkAccess = async () => {
      const { data, error: accessError } = await supabase.rpc("get_my_slaughterhouse_purchase_access");
      if (!mounted) return;
      if (accessError) {
        setError(`Yetki kontrolü yapılamadı: ${accessError.message}`);
        setAccess({ authenticated: true, allowed: false, reason: "Yetki kontrolü tamamlanamadı." });
      } else {
        const current = data as PurchaseAccess;
        if (current.company_id) {
          const centralAccess = await getCompanyOperationAccess(
            supabase,
            current.company_id,
            "create_slaughterhouse_purchase",
          );
          if (!mounted) return;
          setAccess({
            ...current,
            allowed: current.allowed && centralAccess.allowed,
            reason: centralAccess.allowed ? current.reason : centralAccess.message,
            has_required_activity:
              centralAccess.code === "activity_required"
                ? false
                : current.has_required_activity,
          });
        } else {
          setAccess(current);
        }
      }
      setCheckingAccess(false);
    };
    void checkAccess();
    return () => { mounted = false; };
  }, [supabase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (!access?.allowed) { setError("Bu işlem için gerekli şirket yetkiniz bulunmuyor."); return; }
    if (form.delivery_start < minDate) { setError("Teslim başlangıç tarihi bugünden önce olamaz."); return; }
    if (form.delivery_start > maxDate || form.delivery_end > maxDate) { setError("Teslim tarihleri en fazla 2 yıl sonrası için belirlenebilir."); return; }
    if (form.delivery_end < form.delivery_start) { setError("Teslim bitiş tarihi başlangıç tarihinden önce olamaz."); return; }
    const start = Date.parse(`${form.delivery_start}T00:00:00Z`);
    const end = Date.parse(`${form.delivery_end}T00:00:00Z`);
    if ((end - start) / 86400000 > 365) { setError("Teslimat dönemi en fazla 365 gün olabilir."); return; }
    setSaving(true);
    const { data, error: createError } = await supabase.rpc("create_slaughterhouse_purchase_request", { p_data: form });
    if (createError) { setError(createError.message); setSaving(false); return; }
    await dispatchNotificationEmails(supabase);
    router.push(`/kesimhane/alim-merkezi/${data}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/kesimhane/alim-merkezi" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> Alım merkezine dön</Link>
        <header>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-rose-600">Kesimhane alım programı</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Yeni toplu alım talebi</h1>
          <p className="mt-2 text-sm text-slate-500">Bu alan yalnızca faaliyet yetkisi ve yönetim onaylı aktif tesisi bulunan şirketlere açıktır.</p>
        </header>

        {checkingAccess ? (
          <section className="flex items-center justify-center gap-3 rounded-2xl border bg-white p-10 text-sm font-bold text-slate-500 shadow-sm"><Loader2 className="h-5 w-5 animate-spin" /> Şirket yetkileri kontrol ediliyor…</section>
        ) : !access?.allowed ? (
          <AccessDenied access={access} error={error} />
        ) : (
          <>
            <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><span className="rounded-xl bg-emerald-600 p-2.5 text-white"><CheckCircle2 className="h-5 w-5" /></span><div><p className="font-extrabold text-emerald-950">Talep oluşturma yetkiniz doğrulandı</p><p className="mt-1 text-sm text-emerald-800">{access.company_name} · {access.active_facility_count ?? 0} aktif tesis</p></div></div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm">Yetkili şirket</span>
            </section>
            <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
              <Field label="Talep başlığı" wide><input required value={form.title} onChange={(e) => set("title", e.target.value)} className="input" /></Field>
              <Field label="Hayvan türü"><select value={form.animal_type} onChange={(e) => set("animal_type", e.target.value)} className="input"><option>Kanatlı Hayvan</option><option>Küçükbaş</option><option>Büyükbaş</option></select></Field>
              <Field label="Irk / çeşit"><input value={form.breed} onChange={(e) => set("breed", e.target.value)} className="input" /></Field>
              <Field label="İstenen adet"><input required type="number" min="1" value={form.quantity_required} onChange={(e) => set("quantity_required", e.target.value)} className="input" /></Field>
              <Field label="Fiyat modeli"><select value={form.price_model} onChange={(e) => set("price_model", e.target.value)} className="input"><option value="kapali_teklif">Kapalı teklif</option><option value="sabit_kg">Sabit canlı kg</option><option value="sabit_bas">Sabit baş fiyatı</option><option value="cerceve_program">Dönemsel alım programı</option></select></Field>
              <Field label="Hedef fiyat"><input type="number" min="0" step="0.01" value={form.target_price} onChange={(e) => set("target_price", e.target.value)} className="input" /></Field>
              <Field label="Şehir"><input required value={form.city} onChange={(e) => set("city", e.target.value)} className="input" /></Field>
              <Field label="Teslim başlangıcı"><input required type="date" min={minDate} max={maxDate} value={form.delivery_start} onChange={(e) => set("delivery_start", e.target.value)} className="input" /></Field>
              <Field label="Teslim bitişi"><input required type="date" min={form.delivery_start || minDate} max={maxDate} value={form.delivery_end} onChange={(e) => set("delivery_end", e.target.value)} className="input" /></Field>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800 sm:col-span-2">Teslimat başlangıcı bugünden önce olamaz. Tarihler en fazla 2 yıl sonrası için seçilebilir ve teslimat dönemi 365 günü aşamaz.</div>
              <Field label="Minimum canlı ağırlık"><input type="number" step="0.01" value={form.min_live_weight} onChange={(e) => set("min_live_weight", e.target.value)} className="input" /></Field>
              <Field label="Maksimum canlı ağırlık"><input type="number" step="0.01" value={form.max_live_weight} onChange={(e) => set("max_live_weight", e.target.value)} className="input" /></Field>
              <Field label="Nakliye sorumluluğu"><select value={form.transport_responsibility} onChange={(e) => set("transport_responsibility", e.target.value)} className="input"><option value="satici">Satıcı</option><option value="kesimhane">Kesimhane</option><option value="anlasmali">Anlaşmalı nakliyeci</option></select></Field>
              <Field label="Teslimat adresi" wide><input value={form.delivery_address} onChange={(e) => set("delivery_address", e.target.value)} className="input" /></Field>
              <Field label="Sağlık ve belge şartları" wide><textarea value={form.health_requirements} onChange={(e) => set("health_requirements", e.target.value)} className="input min-h-24" /></Field>
              <Field label="Ödeme şartları" wide><textarea value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} className="input min-h-20" /></Field>
              <label className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900 sm:col-span-2"><input type="checkbox" checked={form.expert_required} onChange={(e) => set("expert_required", e.target.checked)} /> Bağımsız ekspertiz zorunlu</label>
              {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:col-span-2"><p className="font-bold">Talep gönderilemedi</p><p className="mt-1">{error}</p></div>}
              <button disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2"><ShieldCheck className="h-4 w-4" />{saving ? "İncelemeye gönderiliyor…" : "Yönetici incelemesine gönder"}</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function AccessDenied({ access, error }: { access: PurchaseAccess | null; error: string | null }) {
  const activityMissing = access?.has_required_activity === false;
  const facilityMissing = (access?.active_facility_count ?? 0) === 0;
  return <section className="overflow-hidden rounded-3xl border border-red-200 bg-white shadow-lg shadow-red-950/5"><div className="bg-slate-950 p-6 text-white"><div className="flex items-start gap-4"><span className="rounded-2xl bg-red-500/15 p-3 text-red-300"><LockKeyhole className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-red-300">İşlem yetkisi gerekli</p><h2 className="mt-2 text-2xl font-black">Toplu alım formu kullanılamıyor</h2><p className="mt-2 text-sm leading-6 text-slate-300">{access?.reason ?? error ?? "Gerekli şirket koşulları tamamlanmamış."}</p></div></div></div><div className="grid gap-4 p-6 md:grid-cols-2"><RequirementCard icon={Building2} title="1. Faaliyet ve belgeler" completed={access?.has_required_activity === true} description="Kesimhane İşletmecisi veya Kesimhane Hayvan Alıcısı faaliyetini ve zorunlu belgeleri onaylatın." href="/profil/faaliyetler?activity=slaughterhouse_buyer" linkLabel={activityMissing ? "Faaliyet başvurusu yap" : "Faaliyetleri görüntüle"} /><RequirementCard icon={Factory} title="2. Tesis onayı" completed={(access?.active_facility_count ?? 0) > 0} description="Şirketinize bağlı kesimhane tesisi yönetim tarafından Aktif durumuna alınmalıdır." href="/kesimhane/tesis-basvurusu" linkLabel={facilityMissing ? "Tesis başvurusu yap" : "Tesisi görüntüle"} /></div>{access?.is_platform_staff && <p className="mx-6 mb-6 rounded-xl bg-violet-50 p-4 text-sm font-semibold text-violet-800">Yönetim hesabı ile ticari işlem yapılamaz. Ayrı şirket hesabıyla giriş yapın.</p>}</section>;
}

function RequirementCard({ icon: Icon, title, completed, description, href, linkLabel }: { icon: typeof Building2; title: string; completed: boolean; description: string; href: string; linkLabel: string }) {
  return <div className={`rounded-2xl border p-5 ${completed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-center gap-3"><span className={`rounded-xl p-2 ${completed ? "bg-emerald-600 text-white" : "bg-amber-200 text-amber-900"}`}><Icon className="h-5 w-5" /></span><div><p className="font-extrabold text-slate-900">{title}</p><p className={`text-xs font-bold ${completed ? "text-emerald-700" : "text-amber-700"}`}>{completed ? "Tamamlandı" : "Eksik"}</p></div></div><p className="mt-4 text-sm leading-6 text-slate-600">{description}</p><Link href={href} className="mt-4 inline-flex rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-400">{linkLabel}</Link></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}
