"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileDrawer from "./MobileDrawer";
import MobileHeader from "./MobileHeader";
import TickerBar from "./TickerBar";
import FloatingQuickActions from "./FloatingQuickActions";
import PasswordRecoveryGuard from "@/components/auth/PasswordRecoveryGuard";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

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
