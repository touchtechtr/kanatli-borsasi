"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ExternalLink, LogOut, ShieldCheck } from "lucide-react";

const ROLE_PATHS: Record<string, string[]> = {
  moderator: ["/admin", "/admin/hareket-kayitlari", "/admin/firmalar", "/admin/faaliyetler", "/admin/ilanlar", "/admin/ilan-promosyonlari", "/admin/ilan-kurallari", "/admin/teklifler", "/admin/kullanicilar"],
  finance: ["/admin", "/admin/hareket-kayitlari", "/admin/finans", "/admin/teklifler", "/admin/ilan-promosyonlari"],
  operations: ["/admin", "/admin/hareket-kayitlari", "/admin/randevular", "/admin/ekspertiz", "/admin/sozlesmeler", "/admin/kesimhaneler", "/admin/eposta-kuyrugu"],
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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [access, setAccess] = useState<PlatformAccess | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.replace("/auth");
  };

  useEffect(() => {
    let mounted = true;

    const checkAccess = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userError || !user) {
        window.location.replace("/auth");
        return;
      }

      const { data: access, error: profileError } = await supabase
        .rpc("get_my_platform_access");

      if (!mounted) return;

      if (profileError) {
        console.error("Admin yetki kontrolü başarısız:", profileError.message);
      }

      if (!access?.is_staff || !access?.active) {
        window.location.replace("/profil");
        return;
      }

      if (access.role !== "super_admin") {
        const allowed = ROLE_PATHS[access.role] ?? ["/admin"];
        const canOpen = allowed.some((path) => path === "/admin" ? pathname === "/admin" : pathname.startsWith(path));
        if (!canOpen) {
          window.location.replace("/admin");
          return;
        }
      }

      setIsAdmin(true);
      setAccess({
        ...access,
        email: access.email ?? user.email ?? null,
        full_name: access.full_name ?? user.user_metadata?.full_name ?? null,
      });
      setChecking(false);
      void dispatchNotificationEmails(supabase);
    };

    void checkAccess();

    return () => {
      mounted = false;
    };
  }, [pathname, supabase]);

  if (checking || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Yönetici yetkisi kontrol ediliyor...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-2 text-violet-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                {access?.full_name || access?.email || "Yönetim hesabı"}
              </p>
              <p className="text-xs font-medium text-violet-700">
                {ROLE_LABELS[access?.role ?? ""] ?? "Platform Personeli"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Ana site</span>
            </Link>
            <button type="button" onClick={() => void signOut()} disabled={signingOut} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{signingOut ? "Çıkılıyor…" : "Çıkış Yap"}</span>
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
