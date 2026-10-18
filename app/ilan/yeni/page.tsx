"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bird,
  Building2,
  CheckCircle2,
  FileCheck2,
  PackagePlus,
  ShieldAlert,
  Wheat,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string; status: string };

const LISTING_TYPES = [
  {
    key: "livestock",
    title: "Canlı hayvan ilanı",
    description: "Kanatlı, küçükbaş ve büyükbaş hayvan satış ilanı oluşturun.",
    href: "/livestock/new",
    icon: Bird,
    tone: "blue",
    activities: ["animal_breeder", "animal_seller", "poultry_breeder", "hatchery", "chick_producer", "egg_producer"],
    application: "animal_seller",
    activityLabel: "Canlı Hayvan Satıcısı",
  },
  {
    key: "feed",
    title: "Yem ve hammadde ilanı",
    description: "Fabrika yemi, toptan yem, tahıl ve hammadde ilanı yayınlayın.",
    href: "/?newListing=general",
    icon: Wheat,
    tone: "emerald",
    activities: ["feed_producer", "feed_wholesaler", "feed_retailer", "raw_material_supplier"],
    application: "feed_wholesaler",
    activityLabel: "Yem Toptancısı veya Satıcısı",
  },
  {
    key: "agricultural-input",
    title: "Zirai girdi ve tarım malzemeleri",
    description: "Gübre, bitki besleme, tohum, fide, sulama ekipmanı ve izinli zirai ürünleri yayınlayın.",
    href: "/?newListing=agri",
    icon: PackagePlus,
    tone: "amber",
    activities: ["agricultural_input_supplier"],
    application: "agricultural_input_supplier",
    activityLabel: "Zirai Girdi ve Tarım Malzemeleri Satıcısı",
  },
] as const;

export default function NewListingCenterPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        router.replace("/auth?next=/ilan/yeni");
        return;
      }
      const [{ data: access }, { data: companyData, error: companyError }] = await Promise.all([
        supabase.rpc("get_my_platform_access"),
        supabase.from("companies").select("id, name, status").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!active) return;
      if (access?.is_staff && access?.active) {
        setIsStaff(true);
        setLoading(false);
        return;
      }
      if (companyError) setError("Şirket bilgileri yüklenemedi: " + companyError.message);
      if (!companyData) {
        setLoading(false);
        return;
      }
      setCompany(companyData as Company);
      const { data: activityRows, error: activityError } = await supabase
        .from("company_activities")
        .select("activity_code")
        .eq("company_id", companyData.id)
        .eq("status", "aktif");
      if (activityError) setError("Faaliyet yetkileri yüklenemedi: " + activityError.message);
      setActivities((activityRows ?? []).map((row) => row.activity_code));
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [router, supabase]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8 marketplace-page">
      <div className="mx-auto max-w-6xl space-y-7">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-emerald-700">
          <ArrowLeft className="h-4 w-4" /> Pazara dön
        </Link>

        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-7 text-white shadow-xl md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-300">İlan merkezi</p>
              <h1 className="mt-3 text-3xl font-black md:text-4xl">Ne satmak istiyorsunuz?</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                İlan türünü seçin. Sistem şirket onayınızı ve gerekli faaliyet yetkinizi ilan oluşturulmadan önce kontrol eder.
              </p>
            </div>
            {!loading && company && !isStaff && (
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs text-slate-300">İlan veren şirket</p>
                <p className="mt-1 font-bold">{company.name}</p>
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Yetkileriniz kontrol ediliyor…</div>
        ) : isStaff ? (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
            <div className="flex gap-4"><ShieldAlert className="h-7 w-7 flex-none text-violet-700" /><div>
              <h2 className="font-extrabold text-violet-950">Yönetici görüntüleme modu</h2>
              <p className="mt-1 text-sm leading-6 text-violet-800">Platform personeli ilan oluşturamaz. Ticari işlemler için platform personeli olmayan ayrı bir şirket hesabı kullanılmalıdır.</p>
              <Link href="/admin" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white">Yönetim merkezine dön <ArrowRight className="h-4 w-4" /></Link>
            </div></div>
          </div>
        ) : !company ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <Building2 className="h-7 w-7 text-amber-700" />
            <h2 className="mt-3 font-extrabold text-amber-950">Önce şirket profilinizi tamamlayın</h2>
            <p className="mt-1 text-sm text-amber-800">İlan yayınlamak için onaylı bir şirket hesabı gereklidir.</p>
            <Link href="/profil/sirket" className="mt-4 inline-flex rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white">Şirket bilgilerime git</Link>
          </div>
        ) : company.status !== "onaylandi" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Şirketiniz onaylanmadan ilan oluşturamazsınız. Mevcut durum: <strong>{company.status}</strong></div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {LISTING_TYPES.map((item) => {
              const allowed = item.activities.some((code) => activities.includes(code));
              const Icon = item.icon;
              return <article key={item.key} className="flex min-h-[290px] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className={`w-fit rounded-2xl p-3 ${item.tone === "blue" ? "bg-blue-100 text-blue-700" : item.tone === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}><Icon className="h-6 w-6" /></div>
                <h2 className="mt-5 text-xl font-extrabold text-slate-900">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                <div className="mt-4 flex items-start gap-2 text-xs text-slate-600"><FileCheck2 className="mt-0.5 h-4 w-4 flex-none" /><span>Gerekli yetki: <strong>{item.activityLabel}</strong></span></div>
                <div className="mt-auto pt-6">
                  {allowed ? <Link href={item.href} className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" /> İlan oluşturmaya devam et</Link>
                    : <Link href={`/profil/faaliyetler?activity=${item.application}`} className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 hover:bg-amber-100">Faaliyet yetkisine başvur <ArrowRight className="h-4 w-4" /></Link>}
                </div>
              </article>;
            })}
          </div>
        )}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
          <div className="flex gap-3"><BadgeCheck className="h-5 w-5 flex-none" /><p><strong>Güvenli yayın süreci:</strong> İlanınız kurallara uygunsa otomatik yayınlanır; risk kuralına takılırsa yönetici incelemesine gönderilir.</p></div>
        </div>
      </div>
    </main>
  );
}
