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
type ReadinessHealth={
  checked_at:string;
  security:{rls_disabled_tables:number;rls_tables_without_policy:number;unsafe_security_definer_functions:number;anonymous_mutation_grants:number};
  communications:{stale_email_queue:number;orphan_email_recipients:number;duplicate_pending_emails:number};
  operations:{stale_deliveries:number;completed_delivery_without_evidence:number;accepted_offer_without_delivery:number;stale_transport_requests:number;matched_transport_without_offer:number};
  identity:{profiles_without_auth_user:number;duplicate_company_tax_numbers:number};
};
type DisputeHealth={
  checked_at:string;
  open_disputes:number;
  allocation_mismatches:number;
  closed_with_incomplete_settlement:number;
  duplicate_completed_legs:number;
  settlement_fee_ledger_mismatches:number;
  completed_state_mismatches:number;
  active_failed_settlements:number;
};
type LogisticsHealth={
  checked_at:string;
  payment_amount_mismatches:number;
  completed_without_payment:number;
  released_without_complete_ledger:number;
  duplicate_completed_transfers:number;
  active_failed_transfers:number;
  completed_state_mismatches:number;
  transfer_fee_ledger_mismatches:number;
  legacy_plaintext_codes:number;
  missing_or_mismatched_secrets:number;
};
type CheckRow={label:string;value:number;description:string;href:string};

export default function AdminSystemHealthPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const[data,setData]=useState<HealthData|null>(null);
  const[lifecycle,setLifecycle]=useState<LifecycleHealth|null>(null);
  const[readiness,setReadiness]=useState<ReadinessHealth|null>(null);
  const[disputes,setDisputes]=useState<DisputeHealth|null>(null);
  const[logistics,setLogistics]=useState<LogisticsHealth|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    const[coreResult,lifecycleResult,readinessResult,disputeResult,logisticsResult]=await Promise.all([
      supabase.rpc("admin_system_integrity_health"),
      supabase.rpc("admin_listing_lifecycle_health"),
      supabase.rpc("admin_production_readiness_health"),
      supabase.rpc("admin_trade_dispute_health"),
      supabase.rpc("admin_logistics_finance_health")
    ]);
    const loadError=coreResult.error||lifecycleResult.error||readinessResult.error||disputeResult.error||logisticsResult.error;
    if(loadError){
      setError(loadError.message);setData(null);setLifecycle(null);setReadiness(null);setDisputes(null);setLogistics(null);
    }else{
      setData(coreResult.data as HealthData);
      setLifecycle(lifecycleResult.data as LifecycleHealth);
      setReadiness(readinessResult.data as ReadinessHealth);
      setDisputes(disputeResult.data as DisputeHealth);
      setLogistics(logisticsResult.data as LogisticsHealth);
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
    ]:[]),
    ...(disputes?[
      {label:"Açık ticari uyuşmazlık",value:disputes.open_disputes,description:"Yönetici kararı bekleyen açık ticari uyuşmazlık dosyaları.",href:"/admin/finans/uyusmazliklar"},
      {label:"Uyuşmazlık dağılım farkı",value:disputes.allocation_mismatches,description:"Alıcı iadesi, satıcı ödemesi ve komisyon toplamı havuz tutarıyla eşleşmeyen kararlar.",href:"/admin/finans/uyusmazliklar"},
      {label:"Eksik aktarımla kapatılmış dosya",value:disputes.closed_with_incomplete_settlement,description:"Kapatıldığı halde gerekli ödeme ayakları tamamlanmamış uyuşmazlıklar.",href:"/admin/finans/uyusmazliklar"},
      {label:"Mükerrer başarılı uyuşmazlık aktarımı",value:disputes.duplicate_completed_legs,description:"Aynı karar ve ödeme ayağı için birden fazla başarılı aktarım.",href:"/admin/finans/uyusmazliklar"},
      {label:"Uyuşmazlık masraf muhasebesi farkı",value:disputes.settlement_fee_ledger_mismatches,description:"Yalnız tamamlanan aktarım masraflarıyla cüzdan muhasebesi eşleşmeyen kararlar.",href:"/admin/finans/uyusmazliklar"},
      {label:"Karar–ödeme durum uyuşmazlığı",value:disputes.completed_state_mismatches,description:"Tamamlanan karar ile uyuşmazlık, teklif veya ödeme durumu birbirini doğrulamıyor.",href:"/admin/finans/uyusmazliklar"},
      {label:"Çözümlenmemiş aktarım hatası",value:disputes.active_failed_settlements,description:"Hatalı aktarımından sonra başarılı yedek aktarımı bulunmayan uyuşmazlık dosyaları.",href:"/admin/finans/uyusmazliklar"}
    ]:[]),
    ...(logistics?[
      {label:"Lojistik ödeme tutar farkı",value:logistics.payment_amount_mismatches,description:"Nakliyeci alacağı ve komisyon toplamı alıcı toplamıyla eşleşmeyen ödemeler.",href:"/admin/lojistik"},
      {label:"Ödemesiz tamamlanan nakliye",value:logistics.completed_without_payment,description:"Tamamlandığı halde ödeme kaydı bulunmayan taşıma dosyaları.",href:"/admin/lojistik"},
      {label:"Eksik lojistik cüzdan kaydı",value:logistics.released_without_complete_ledger,description:"Serbest bırakıldığı halde alıcı, nakliyeci veya komisyon muhasebesi eksik ödemeler.",href:"/admin/lojistik"},
      {label:"Mükerrer başarılı lojistik aktarımı",value:logistics.duplicate_completed_transfers,description:"Aynı lojistik ödemesi için birden fazla başarılı banka aktarımı.",href:"/admin/lojistik"},
      {label:"Çözümlenmemiş lojistik aktarım hatası",value:logistics.active_failed_transfers,description:"Başarısız denemeden sonra etkin veya tamamlanmış yedek aktarımı olmayan ödemeler.",href:"/admin/lojistik"},
      {label:"Lojistik durum uyuşmazlığı",value:logistics.completed_state_mismatches,description:"Ödeme, taşıma ve talep tamamlanma durumları birbirini doğrulamayan dosyalar.",href:"/admin/lojistik"},
      {label:"Lojistik masraf muhasebesi farkı",value:logistics.transfer_fee_ledger_mismatches,description:"Başarılı banka aktarım masrafı ile cüzdan kaydı eşleşmeyen ödemeler.",href:"/admin/lojistik"},
      {label:"Açık metin teslimat kodu",value:logistics.legacy_plaintext_codes,description:"Güvenli kasa dışında eski düz metin yükleme veya teslimat kodu bulunan dosyalar.",href:"/admin/lojistik"},
      {label:"Eksik lojistik kod kasası",value:logistics.missing_or_mismatched_secrets,description:"Teslimat kod kasası olmayan veya talep sahibiyle eşleşmeyen taşıma dosyaları.",href:"/admin/lojistik"}
    ]:[]),
    ...(readiness?[
      {label:"RLS kapalı tablo",value:readiness.security.rls_disabled_tables,description:"Public şemada satır güvenliği etkin olmayan tablolar.",href:"/admin/sistem-sagligi"},
      {label:"Politikasız RLS tablosu",value:readiness.security.rls_tables_without_policy,description:"RLS açık olduğu halde erişim politikası bulunmayan tablolar.",href:"/admin/sistem-sagligi"},
      {label:"Güvensiz SECURITY DEFINER",value:readiness.security.unsafe_security_definer_functions,description:"Sabit search_path tanımı olmayan yetkili veritabanı fonksiyonları.",href:"/admin/sistem-sagligi"},
      {label:"Anonim yazma yetkisi",value:readiness.security.anonymous_mutation_grants,description:"Anon rolüne doğrudan ekleme, değiştirme veya silme yetkisi verilen tablolar.",href:"/admin/sistem-sagligi"},
      {label:"Gecikmiş e-posta kuyruğu",value:readiness.communications.stale_email_queue,description:"Otuz dakikadan uzun süredir gönderilemeyen bildirim e-postaları.",href:"/admin/eposta-kuyrugu"},
      {label:"Sahipsiz e-posta alıcısı",value:readiness.communications.orphan_email_recipients,description:"Artık kullanıcı hesabı bulunmayan e-posta kuyruğu kayıtları.",href:"/admin/eposta-kuyrugu"},
      {label:"Tekrarlanan bekleyen e-posta",value:readiness.communications.duplicate_pending_emails,description:"Aynı alıcı ve içerik için birden fazla bekleyen gönderim.",href:"/admin/eposta-kuyrugu"},
      {label:"Yedi gündür bekleyen teslimat",value:readiness.operations.stale_deliveries,description:"Tamamlanmamış veya iptal edilmemiş eski kesimhane teslimatları.",href:"/admin/kesimhane-alimlari"},
      {label:"Kanıtsız tamamlanan teslimat",value:readiness.operations.completed_delivery_without_evidence,description:"Onay veya tamamlanma durumuna geldiği halde kanıtı bulunmayan teslimatlar.",href:"/admin/kesimhane-alimlari"},
      {label:"Teslimatsız kabul edilen teklif",value:readiness.operations.accepted_offer_without_delivery,description:"Kabul edildiği halde teslimat dosyası oluşmayan kesimhane teklifleri.",href:"/admin/kesimhane-alimlari"},
      {label:"Yedi gündür bekleyen nakliye",value:readiness.operations.stale_transport_requests,description:"Tamamlanmamış veya iptal edilmemiş eski taşıma talepleri.",href:"/admin/lojistik"},
      {label:"Teklifsiz eşleşmiş nakliye",value:readiness.operations.matched_transport_without_offer,description:"Eşleşmiş göründüğü halde kabul edilmiş taşıma teklifi bulunmayan talepler.",href:"/admin/lojistik"},
      {label:"Auth kaydı olmayan profil",value:readiness.identity.profiles_without_auth_user,description:"Kimlik doğrulama kullanıcısı silinmiş profil kayıtları.",href:"/admin/kullanicilar"},
      {label:"Tekrarlanan vergi numarası",value:readiness.identity.duplicate_company_tax_numbers,description:"Birden fazla şirkette kullanılan aynı vergi numaraları.",href:"/admin/firmalar"}
    ]:[])
  ]:[];
  const issueCount=checks.reduce((total,item)=>total+item.value,0);
  const guardCount=data?Object.values(data.required_guards).filter(Boolean).length:0;
  const guardTotal=data?Object.keys(data.required_guards).length:0;

  return <PageShell>
    <PageHeader
      eyebrow="Platform bütünlük denetimi"
      title="Sistem Sağlığı"
      description="Yetkilendirme, RLS güvenliği, ödeme, bildirim, teslimat, lojistik ve kimlik bütünlüğünü tek ekrandan izleyin."
      icon={ShieldCheck}
      actions={<button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-extrabold text-white transition hover:opacity-90 disabled:opacity-60"><RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/>Yeniden denetle</button>}
    />

    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">Sistem sağlığı yüklenemedi: {error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Bütünlük sorunu" value={loading?"—":String(issueCount)} helper={issueCount?"İncelenmesi gereken kayıt":"Kritik tutarsızlık bulunmadı"} icon={issueCount?AlertTriangle:CheckCircle2} tone={issueCount?"amber":"emerald"}/>
      <MetricCard label="Yetki kuralı" value={loading?"—":String(data?.authorization.enabled_operation_rules??0)} helper="Etkin merkezi işlem kuralı" icon={BadgeCheck} tone="violet"/>
      <MetricCard label="Durum koruması" value={loading?"—":guardCount+" / "+guardTotal} helper={"RLS sorunu: "+String((readiness?.security.rls_disabled_tables??0)+(readiness?.security.rls_tables_without_policy??0))} icon={Database} tone={guardCount===guardTotal&&(readiness?.security.rls_disabled_tables??0)===0?"emerald":"amber"}/>
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
