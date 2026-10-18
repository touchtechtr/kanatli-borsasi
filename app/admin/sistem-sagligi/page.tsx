"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, BadgeCheck, Building2, CheckCircle2, Database, MailWarning, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MetricCard, PageHeader, PageShell, SurfaceCard } from "@/components/ui/PlatformUI";

type HealthData = {
  checked_at: string;
  authorization: { enabled_operation_rules:number; companies_without_owner:number; approved_companies_without_activity:number; active_staff_with_company:number };
  trade_finance: { accepted_offers_without_payment:number; released_payments_without_complete_ledger:number; amount_mismatches:number };
  slaughterhouse_finance: { completed_deliveries_without_payment:number; released_payments_without_complete_ledger:number; amount_mismatches:number; ready_deliveries_with_dispute:number };
  email_queue: { pending:number; failed:number; permanently_failed:number };
  required_guards: Record<string,boolean>;
};
type LifecycleHealth={
  checked_at:string;
  active_with_no_remaining_quantity:number;
  expired_but_active:number;
  in_progress_without_accepted_offer:number;
  accepted_offer_listing_not_in_progress:number;
  completed_with_remaining_quantity:number;
  invalid_quantity_balance:number;
  multiple_accepted_offers:number;
};
type CheckRow={label:string;value:number;description:string;href:string};

export default function AdminSystemHealthPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const[data,setData]=useState<HealthData|null>(null);
  const[lifecycle,setLifecycle]=useState<LifecycleHealth|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    const[coreResult,lifecycleResult]=await Promise.all([
      supabase.rpc("admin_system_integrity_health"),
      supabase.rpc("admin_listing_lifecycle_health")
    ]);
    const loadError=coreResult.error||lifecycleResult.error;
    if(loadError){
      setError(loadError.message);setData(null);setLifecycle(null);
    }else{
      setData(coreResult.data as HealthData);
      setLifecycle(lifecycleResult.data as LifecycleHealth);
    }
    setLoading(false);
  },[supabase]);
  useEffect(()=>{void load()},[load]);

  const checks:CheckRow[]=data?[
    {label:"Sahipsiz şirket",value:data.authorization.companies_without_owner,description:"Bir kullanıcı hesabına bağlı olmayan şirketler.",href:"/admin/firmalar"},
    {label:"Faaliyetsiz onaylı şirket",value:data.authorization.approved_companies_without_activity,description:"Onaylı olduğu halde aktif faaliyet kaydı bulunmayan şirketler.",href:"/admin/faaliyetler"},
    {label:"Personel–şirket çakışması",value:data.authorization.active_staff_with_company,description:"Aktif platform personeline hâlâ bağlı ticari şirketler.",href:"/admin/personel"},
    {label:"Ödemesiz kabul edilmiş teklif",value:data.trade_finance.accepted_offers_without_payment,description:"Kabul/tamamlanma durumunda olup ödeme kaydı oluşmayan teklifler.",href:"/admin/finans"},
    {label:"Eksik ticari cüzdan kaydı",value:data.trade_finance.released_payments_without_complete_ledger,description:"Aktarıldığı halde üçlü muhasebe kaydı tamamlanmamış ödemeler.",href:"/admin/finans"},
    {label:"Ticari tutar farkı",value:data.trade_finance.amount_mismatches,description:"Satıcı alacağı + komisyon toplamı alıcı toplamıyla eşleşmeyenler.",href:"/admin/finans"},
    {label:"Ödemesiz tamamlanan teslimat",value:data.slaughterhouse_finance.completed_deliveries_without_payment,description:"Tamamlandığı halde kesimhane ödeme kaydı olmayan teslimatlar.",href:"/admin/kesimhane-alimlari"},
    {label:"Eksik kesimhane cüzdan kaydı",value:data.slaughterhouse_finance.released_payments_without_complete_ledger,description:"Serbest bırakıldığı halde üçlü muhasebe kaydı eksik işlemler.",href:"/admin/finans"},
    {label:"Kesimhane tutar farkı",value:data.slaughterhouse_finance.amount_mismatches,description:"Kesimhane ödeme bileşenleri birbiriyle eşleşmeyen kayıtlar.",href:"/admin/finans"},
    {label:"Uyuşmazlıklı hazır ödeme",value:data.slaughterhouse_finance.ready_deliveries_with_dispute,description:"Uyuşmazlığı olduğu halde ödeme serbest bırakmaya hazır görünenler.",href:"/admin/kesimhane-alimlari"},
    {label:"Kalıcı e-posta hatası",value:data.email_queue.permanently_failed,description:"Dört gönderim denemesinden sonra hâlâ başarısız olan e-postalar.",href:"/admin/eposta-kuyrugu"},
    ...(lifecycle?[
      {label:"Miktarı kalmayan aktif ilan",value:lifecycle.active_with_no_remaining_quantity,description:"Aktif göründüğü halde satılabilir miktarı kalmayan ilanlar.",href:"/admin/ilanlar"},
      {label:"Süresi dolduğu halde aktif ilan",value:lifecycle.expired_but_active,description:"Yayın bitiş zamanı geçmiş ancak hâlâ aktif görünen ilanlar.",href:"/admin/ilanlar"},
      {label:"Teklifsiz işlemde ilan",value:lifecycle.in_progress_without_accepted_offer,description:"İşlemde olup kabul edilmiş teklifi bulunmayan ilanlar.",href:"/admin/ilanlar"},
      {label:"İşleme alınmamış kabul edilmiş teklif",value:lifecycle.accepted_offer_listing_not_in_progress,description:"Teklifi kabul edilmiş fakat ilan durumu işlemde olmayan kayıtlar.",href:"/admin/teklifler"},
      {label:"Kalan miktarlı tamamlanmış ilan",value:lifecycle.completed_with_remaining_quantity,description:"Tamamlandığı halde satılabilir miktarı bulunan ilanlar.",href:"/admin/ilanlar"},
      {label:"Geçersiz miktar dengesi",value:lifecycle.invalid_quantity_balance,description:"İlk, kalan, rezerve ve satılan miktarları uyuşmayan ilanlar.",href:"/admin/ilanlar"},
      {label:"Birden fazla kabul edilmiş teklif",value:lifecycle.multiple_accepted_offers,description:"Aynı ilan için eş zamanlı kabul edilmiş birden fazla teklif.",href:"/admin/teklifler"}
    ]:[])
  ]:[];
  const issueCount=checks.reduce((total,item)=>total+item.value,0);
  const guardCount=data?Object.values(data.required_guards).filter(Boolean).length:0;
  const guardTotal=data?Object.keys(data.required_guards).length:0;

  return <PageShell>
    <PageHeader
      eyebrow="Platform bütünlük denetimi"
      title="Sistem Sağlığı"
      description="Yetkilendirme, ödeme, cüzdan, kesimhane teslimatı ve e-posta kuyruğundaki tutarsızlıkları tek ekrandan izleyin."
      icon={ShieldCheck}
      actions={<button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-extrabold text-white transition hover:opacity-90 disabled:opacity-60"><RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/>Yeniden denetle</button>}
    />

    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">Sistem sağlığı yüklenemedi: {error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Bütünlük sorunu" value={loading?"—":String(issueCount)} helper={issueCount?"İncelenmesi gereken kayıt":"Kritik tutarsızlık bulunmadı"} icon={issueCount?AlertTriangle:CheckCircle2} tone={issueCount?"amber":"emerald"}/>
      <MetricCard label="Yetki kuralı" value={loading?"—":String(data?.authorization.enabled_operation_rules??0)} helper="Etkin merkezi işlem kuralı" icon={BadgeCheck} tone="violet"/>
      <MetricCard label="Durum koruması" value={loading?"—":guardCount+" / "+guardTotal} helper="Gerekli güvenlik fonksiyonları" icon={Database} tone={guardCount===guardTotal?"emerald":"amber"}/>
      <MetricCard label="E-posta kuyruğu" value={loading?"—":String(data?.email_queue.pending??0)} helper={String(data?.email_queue.failed??0)+" yeniden denenecek hata"} icon={MailWarning} tone="blue"/>
    </section>

    <SurfaceCard>
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.16em] text-violet-600">Otomatik kontroller</p><h2 className="mt-1 text-xl font-black text-slate-900">Kayıt bütünlüğü sonuçları</h2></div>
        {data?.checked_at&&<p className="text-xs font-semibold text-slate-500">Son kontrol: {new Date(data.checked_at.endsWith("Z")||data.checked_at.includes("+",10)?data.checked_at:data.checked_at+"Z").toLocaleString("tr-TR",{timeZone:"Europe/Istanbul"})}</p>}
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {checks.map(check=><Link key={check.label} href={check.href} className={"group flex items-start gap-4 rounded-2xl border p-4 transition hover:-translate-y-0.5 "+(check.value?"border-amber-200 bg-amber-50/70 hover:border-amber-300":"border-emerald-100 bg-emerald-50/50 hover:border-emerald-200")}>
          <span className={"mt-0.5 rounded-xl p-2 "+(check.value?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700")}>{check.value?<AlertTriangle className="h-5 w-5"/>:<CheckCircle2 className="h-5 w-5"/>}</span>
          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><span className="font-extrabold text-slate-900">{check.label}</span><span className={"rounded-full px-2.5 py-1 text-xs font-black "+(check.value?"bg-amber-200 text-amber-900":"bg-emerald-200 text-emerald-900")}>{check.value}</span></span>
          <span className="mt-1 block text-xs leading-5 text-slate-600">{check.description}</span><span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-700">İlgili modülü aç<ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"/></span></span>
        </Link>)}
      </div>
    </SurfaceCard>

    <section className="grid gap-4 md:grid-cols-3">
      <QuickLink href="/admin/finans" title="Finans denetimi" description="Ödeme, komisyon ve cüzdan kayıtlarını inceleyin." icon={Wallet}/>
      <QuickLink href="/admin/hareket-kayitlari" title="Hareket kayıtları" description="Durum değişikliklerinin denetim izini görüntüleyin." icon={Activity}/>
      <QuickLink href="/admin/firmalar" title="Şirket bütünlüğü" description="Sahiplik, faaliyet ve şirket durumlarını kontrol edin." icon={Building2}/>
    </section>
  </PageShell>
}

function QuickLink({href,title,description,icon:Icon}:{href:string;title:string;description:string;icon:typeof ShieldCheck}){
  return <Link href={href} className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300"><span className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><Icon className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="font-extrabold text-slate-900">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span><ArrowRight className="mt-1 h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-600"/></Link>
}
