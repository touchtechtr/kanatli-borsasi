"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileDrawer from "./MobileDrawer";
import MobileHeader from "./MobileHeader";
import TickerBar from "./TickerBar";
import FloatingQuickActions from "./FloatingQuickActions";
import PasswordRecoveryGuard from "@/components/auth/PasswordRecoveryGuard";
import { createClient } from "@/lib/supabase/client";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkingRootAccess, setCheckingRootAccess] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    let mounted = true;

    const redirectPlatformStaff = async () => {
      if (pathname !== "/" || window.location.search.includes("sitePreview=1")) {
        setCheckingRootAccess(false);
        return;
      }

      setCheckingRootAccess(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!session) {
        setCheckingRootAccess(false);
        return;
      }

      const { data: access } = await supabase.rpc("get_my_platform_access");
      if (!mounted) return;

      if (access?.is_staff && access?.active) {
        window.location.replace("/admin");
        return;
      }

      setCheckingRootAccess(false);
    };

    void redirectPlatformStaff();
    return () => { mounted = false; };
  }, [pathname, supabase]);

  useEffect(() => {
    if (!drawerOpen) return;

    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  if (isAdminRoute) {
    return (
      <>
        <PasswordRecoveryGuard />
        {children}
      </>
    );
  }

  if (checkingRootAccess) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-semibold text-slate-300">Yönetim hesabı kontrol ediliyor…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <PasswordRecoveryGuard />
      <Sidebar />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader onMenuClick={() => setDrawerOpen(true)} />
        <TickerBar />
        <main id="app-scroll-container" className="flex-1 overflow-y-auto p-6">{children}</main>
        <FloatingQuickActions />
      </div>
    </div>
  );
}
