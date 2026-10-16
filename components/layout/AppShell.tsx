"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileDrawer from "./MobileDrawer";
import MobileHeader from "./MobileHeader";
import TickerBar from "./TickerBar";

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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {!isAdminRoute && <Sidebar />}
      {!isAdminRoute && (
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {!isAdminRoute && (
          <MobileHeader onMenuClick={() => setDrawerOpen(true)} />
        )}
        <TickerBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
