"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Bell,
  Building2,
  CalendarCheck2,
  ChevronRight,
  CircleDollarSign,
  Crown,
  ExternalLink,
  Factory,
  HeartPulse,
  FileSignature,
  LayoutDashboard,
  LogOut,
  MailWarning,
  Menu,
  Microscope,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  Truck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";

const ROLE_PATHS: Record<string, string[]> = {
  moderator: ["/admin", "/admin/hareket-kayitlari", "/admin/firmalar", "/admin/faaliyetler", "/admin/ilanlar", "/admin/ilan-promosyonlari", "/admin/ilan-kurallari", "/admin/teklifler", "/admin/kullanicilar"],
  finance: ["/admin", "/admin/hareket-kayitlari", "/admin/finans", "/admin/teklifler", "/admin/ilan-promosyonlari", "/admin/kesimhane-alimlari"],
  operations: ["/admin", "/admin/hareket-kayitlari", "/admin/randevular", "/admin/ekspertiz", "/admin/sozlesmeler", "/admin/kesimhaneler", "/admin/kesimhane-alimlari", "/admin/eposta-kuyrugu"],
  auditor: ["/admin", "/admin/hareket-kayitlari"],
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Süper Yönetici",
  moderator: "Moderatör",
  finance: "Finans Yöneticisi",
  operations: "Operasyon Yöneticisi",
  auditor: "Salt Okunur Denetçi",
};

type PlatformAccess = {
  is_staff: boolean;
  role: string | null;
  active: boolean;
  email?: string | null;
  full_name?: string | null;
};

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "İnceleme ve ticaret",
    items: [
      { label: "Firmalar", href: "/admin/firmalar", icon: Building2 },
      { label: "Faaliyetler", href: "/admin/faaliyetler", icon: BadgeCheck },
      { label: "İlanlar", href: "/admin/ilanlar", icon: Activity },
      { label: "Teklifler", href: "/admin/teklifler", icon: Tags },
      { label: "Öne Çıkarma", href: "/admin/ilan-promosyonlari", icon: Crown },
      { label: "İlan Kuralları", href: "/admin/ilan-kurallari", icon: Settings2 },
    ],
  },
  {
    title: "Operasyon",
    items: [
      { label: "Randevular", href: "/admin/randevular", icon: CalendarCheck2 },
      { label: "Ekspertiz", href: "/admin/ekspertiz", icon: Microscope },
      { label: "Sözleşmeler", href: "/admin/sozlesmeler", icon: FileSignature },
      { label: "Kesimhaneler", href: "/admin/kesimhaneler", icon: Factory },
      { label: "Kesimhane Alımları", href: "/admin/kesimhane-alimlari", icon: Truck },
    ],
  },
  {
    title: "Finans ve sistem",
    items: [
      { label: "Finans ve Ödemeler", href: "/admin/finans", icon: CircleDollarSign },
      { label: "Kullanıcılar", href: "/admin/kullanicilar", icon: Users },
      { label: "Yönetim Personeli", href: "/admin/personel", icon: UserCog },
      { label: "Bildirimler", href: "/admin/bildirimler", icon: Bell },
      { label: "E-posta Kuyruğu", href: "/admin/eposta-kuyrugu", icon: MailWarning },
      { label: "Hareket Kayıtları", href: "/admin/hareket-kayitlari", icon: ScrollText },
      { label: "Sistem Sağlığı", href: "/admin/sistem-sagligi", icon: HeartPulse },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [access, setAccess] = useState<PlatformAccess | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const canOpenPath = (href: string) => {
    if (access?.role === "super_admin") return true;
    return (ROLE_PATHS[access?.role ?? ""] ?? ["/admin"]).includes(href);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.replace("/auth");
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    const checkAccess = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError || !user) { window.location.replace("/auth"); return; }

      const { data: result, error: profileError } = await supabase.rpc("get_my_platform_access");
      if (!mounted) return;
      if (profileError) console.error("Admin yetki kontrolü başarısız:", profileError.message);
      if (!result?.is_staff || !result?.active) { window.location.replace("/profil"); return; }

      if (result.role !== "super_admin") {
        const allowed = ROLE_PATHS[result.role] ?? ["/admin"];
        const permitted = allowed.some((path) => path === "/admin" ? pathname === "/admin" : pathname.startsWith(path));
        if (!permitted) { window.location.replace("/admin"); return; }
      }

      setIsAdmin(true);
      setAccess({ ...result, email: result.email ?? user.email ?? null, full_name: result.full_name ?? user.user_metadata?.full_name ?? null });
      setChecking(false);
      void dispatchNotificationEmails(supabase);
    };
    void checkAccess();
    return () => { mounted = false; };
  }, [pathname, supabase]);

  if (checking || !isAdmin) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-semibold text-slate-300">Yönetici yetkisi kontrol ediliyor…</div>;
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#07111f_0%,#0f1930_60%,#17153a_100%)] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/admin" className="flex items-center gap-3">
          <span className="rounded-2xl bg-violet-500/20 p-2.5 text-violet-300 ring-1 ring-violet-400/20"><ShieldCheck className="h-6 w-6" /></span>
          <span><span className="block text-sm font-black tracking-wide">KANATLI BORSASI</span><span className="block text-[11px] font-semibold text-slate-400">Platform yönetimi</span></span>
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <Link href="/admin" className={`group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-extrabold transition ${pathname === "/admin" ? "bg-violet-500 text-white shadow-lg shadow-violet-950/30" : "bg-white/10 text-violet-100 hover:bg-white/15"}`}>
          <LayoutDashboard className="h-5 w-5" /><span className="flex-1">Yönetim Merkezi</span><ChevronRight className="h-4 w-4 opacity-70" />
        </Link>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => canOpenPath(item.href));
          if (!items.length) return null;
          return <div key={group.title}><p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[.18em] text-slate-500">{group.title}</p><div className="space-y-1">{items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-white/12 text-white ring-1 ring-white/10" : "text-slate-400 hover:bg-white/8 hover:text-white"}`}><Icon className={`h-[18px] w-[18px] ${active ? "text-violet-300" : "text-slate-500 group-hover:text-violet-300"}`} /><span className="flex-1 truncate">{item.label}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />}</Link>;
          })}</div></div>;
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <p className="truncate text-sm font-bold text-white">{access?.full_name || access?.email || "Yönetim hesabı"}</p>
          <p className="mt-0.5 text-xs font-semibold text-violet-300">{ROLE_LABELS[access?.role ?? ""] ?? "Platform Personeli"}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">{sidebar}</aside>
      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Menüyü kapat" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" /><aside className="relative h-full w-[86%] max-w-80 shadow-2xl">{sidebar}<button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-xl bg-white/10 p-2 text-white"><X className="h-5 w-5" /></button></aside></div>}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xl md:px-7">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 lg:hidden"><Menu className="h-5 w-5" /></button>
              <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{pathname === "/admin" ? "Yönetim Merkezi" : "Yönetim Çalışma Alanı"}</p><p className="hidden text-xs text-slate-500 sm:block">Güvenli inceleme, operasyon ve finans yönetimi</p></div>
            </div>
            <div className="flex items-center gap-2">
              {pathname !== "/admin" && <Link href="/admin" className="hidden items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-800 sm:inline-flex"><LayoutDashboard className="h-4 w-4" />Yönetim Merkezi</Link>}
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><ExternalLink className="h-4 w-4" /><span className="hidden md:inline">Ana site</span></Link>
              <button type="button" onClick={() => void signOut()} disabled={signingOut} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"><LogOut className="h-4 w-4" /><span className="hidden md:inline">{signingOut ? "Çıkılıyor…" : "Çıkış"}</span></button>
            </div>
          </div>
        </header>
        <div className="min-h-[calc(100vh-61px)]">{children}</div>
      </div>
    </div>
  );
}
