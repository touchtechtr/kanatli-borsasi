"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BadgeCheck, Bell, BookOpenText, Building2, CalendarCheck2, CircleDollarSign, ClipboardCheck, Crown, Factory, Feather, FileSignature, Handshake, Landmark, LayoutDashboard, LogOut, MailWarning, Microscope, PackageSearch, ScrollText, Settings2, ShieldCheck, Tags, TrendingUp, Truck, UserCircle, UserCog, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/constants/company";
import type { CompanyRole } from "@/types/company";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type SidebarAccount = { authenticated: boolean; isAdmin: boolean; adminRole: string | null; name: string; label: string; initials: string };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Genel Bakış", items: [{ href: "/", label: "Anasayfa", icon: LayoutDashboard }] },
  { title: "Ticaret & Üretim", items: [
    { href: "/borsa", label: "Piyasa Fiyatları", icon: TrendingUp },
    { href: "/sozlesme-yonetimi", label: "Sözleşmeli Üretim", icon: FileSignature },
    { href: "/kesimhane", label: "Kesimhane", icon: Factory },
  ] },
  { title: "Danışmanlık & Bilgi", items: [
    { href: "/ekspertiz", label: "Ekspertiz", icon: ClipboardCheck },
    { href: "/teknik-merkez", label: "Teknik Merkez", icon: BookOpenText },
    { href: "/sektor-konseyi", label: "Sektör Konseyi", icon: Landmark },
  ] },
  { title: "Şirket Hesabı", items: [
    { href: "/profil/ilanlarim", label: "İlanlarım", icon: PackageSearch },
    { href: "/profil/teklifler", label: "Ticari Teklifler", icon: Handshake },
    { href: "/profil", label: "Hesap Merkezi", icon: UserCircle, exact: true },
  ] },
];

const ADMIN_ROLE_LABELS: Record<string, string> = {
  super_admin: "Süper Yönetici", moderator: "Moderatör", finance: "Finans Yöneticisi",
  operations: "Operasyon Yöneticisi", auditor: "Salt Okunur Denetçi",
};
const ADMIN_ROLE_PATHS: Record<string, string[]> = {
  moderator: ["/admin", "/admin/hareket-kayitlari", "/admin/firmalar", "/admin/faaliyetler", "/admin/ilanlar", "/admin/ilan-promosyonlari", "/admin/ilan-kurallari", "/admin/teklifler", "/admin/kullanicilar"],
  finance: ["/admin", "/admin/hareket-kayitlari", "/admin/finans", "/admin/teklifler", "/admin/ilan-promosyonlari", "/admin/kesimhane-alimlari"],
  operations: ["/admin", "/admin/hareket-kayitlari", "/admin/randevular", "/admin/ekspertiz", "/admin/sozlesmeler", "/admin/kesimhaneler", "/admin/kesimhane-alimlari", "/admin/eposta-kuyrugu"],
  auditor: ["/admin", "/admin/hareket-kayitlari"],
};
const ADMIN_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "İnceleme ve ticaret", items: [
    { href: "/admin/firmalar", label: "Firmalar", icon: Building2 },
    { href: "/admin/faaliyetler", label: "Faaliyetler", icon: BadgeCheck },
    { href: "/admin/ilanlar", label: "İlanlar", icon: Activity },
    { href: "/admin/teklifler", label: "Teklifler", icon: Tags },
    { href: "/admin/ilan-promosyonlari", label: "Öne Çıkarma", icon: Crown },
    { href: "/admin/ilan-kurallari", label: "İlan Kuralları", icon: Settings2 },
  ] },
  { title: "Operasyon", items: [
    { href: "/admin/randevular", label: "Randevular", icon: CalendarCheck2 },
    { href: "/admin/ekspertiz", label: "Ekspertiz", icon: Microscope },
    { href: "/admin/sozlesmeler", label: "Sözleşmeler", icon: FileSignature },
    { href: "/admin/kesimhaneler", label: "Kesimhaneler", icon: Factory },
    { href: "/admin/kesimhane-alimlari", label: "Kesimhane Alımları", icon: Truck },
  ] },
  { title: "Finans ve sistem", items: [
    { href: "/admin/finans", label: "Finans ve Ödemeler", icon: CircleDollarSign },
    { href: "/admin/kullanicilar", label: "Kullanıcılar", icon: Users },
    { href: "/admin/personel", label: "Yönetim Personeli", icon: UserCog },
    { href: "/admin/bildirimler", label: "Bildirimler", icon: Bell },
    { href: "/admin/eposta-kuyrugu", label: "E-posta Kuyruğu", icon: MailWarning },
    { href: "/admin/hareket-kayitlari", label: "Hareket Kayıtları", icon: ScrollText },
  ] },
];
const GUEST_ACCOUNT: SidebarAccount = { authenticated: false, isAdmin: false, adminRole: null, name: "Misafir", label: "Giriş yapılmadı", initials: "M" };

export default function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [account, setAccount] = useState<SidebarAccount>(GUEST_ACCOUNT);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadAccount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) return setAccount(GUEST_ACCOUNT);
      const [{ data: profile }, { data: company }, { data: access }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("companies").select("role").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("get_my_platform_access"),
      ]);
      if (!mounted) return;
      const fullName = profile?.full_name?.trim() || user.user_metadata?.full_name?.trim() || user.email?.split("@")[0] || "Kullanıcı";
      const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join("").toLocaleUpperCase("tr-TR") || "K";
      const role = company?.role as CompanyRole | undefined;
      const isAdmin = Boolean(access?.is_staff && access?.active);
      setAccount({ authenticated: true, isAdmin, adminRole: isAdmin ? access?.role ?? null : null, name: fullName, initials,
        label: isAdmin ? ADMIN_ROLE_LABELS[access?.role] || "Platform Personeli" : role ? `${ROLE_LABELS[role] || role} Hesabı` : "Kullanıcı Hesabı" });
    };
    void loadAccount();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => void loadAccount());
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [supabase]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    onNavigate?.();
    window.location.replace("/auth");
  };

  return <>
    <div className="flex h-16 flex-shrink-0 items-center gap-2 border-b border-navy-800 px-6">
      <Feather className="h-6 w-6 text-tarim-500" strokeWidth={2.5} />
      <span className="text-lg font-semibold tracking-tight text-white">Kanatlı<span className="text-tarim-500">Borsa</span></span>
    </div>
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
      {account.isAdmin ? <>
        <div>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Platform yönetimi</p>
          <Link href="/admin" onClick={onNavigate} className="group flex items-center gap-3 rounded-xl bg-violet-600 px-3 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/20 transition hover:bg-violet-500">
            <ShieldCheck className="h-[18px] w-[18px]" /> Yönetim Merkezi
            <span className="ml-auto text-[10px] text-violet-200">Ana panel</span>
          </Link>
        </div>
        {ADMIN_GROUPS.map((group) => {
          const allowed = account.adminRole === "super_admin" ? group.items : group.items.filter((item) => (ADMIN_ROLE_PATHS[account.adminRole ?? ""] ?? ["/admin"]).includes(item.href));
          if (!allowed.length) return null;
          return <div key={group.title}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{group.title}</p>
            <div className="space-y-1">{allowed.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return <Link key={href} href={href} onClick={onNavigate} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-violet-500/15 text-violet-300" : "text-slate-400 hover:bg-navy-800 hover:text-white"}`}>
                <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? "text-violet-300" : "text-slate-500 group-hover:text-violet-300"}`} />{label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400" />}
              </Link>;
            })}</div>
          </div>;
        })}
      </> : NAV_GROUPS.map((group) => <div key={group.title}>
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{group.title}</p>
        <div className="space-y-1">{group.items.map(({ href, label, icon: Icon, exact }) => {
          const active = href === "/" || exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} onClick={onNavigate} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-tarim-600/15 text-tarim-400" : "text-slate-400 hover:bg-navy-800 hover:text-white"}`}>
            <Icon className="h-[18px] w-[18px] flex-shrink-0" />{label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-tarim-500" />}
          </Link>;
        })}</div>
      </div>)}
    </nav>
    <div className="flex-shrink-0 space-y-2 border-t border-navy-800 p-4">
      <Link href={account.authenticated ? (account.isAdmin ? "/admin" : "/profil") : "/auth"} onClick={onNavigate} className="flex items-center gap-3 rounded-lg bg-navy-900 px-3 py-2.5 transition-colors hover:bg-navy-800">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-tarim-600 text-sm font-semibold text-white">{account.initials}</div>
        <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{account.name}</p><p className="truncate text-xs text-slate-500">{account.label}</p></div>
      </Link>
      {account.authenticated && <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/60 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-950/50 disabled:opacity-50">
        <LogOut className="h-3.5 w-3.5" />{signingOut ? "Çıkılıyor…" : "Çıkış Yap"}
      </button>}
    </div>
  </>;
}
