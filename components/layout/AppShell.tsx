"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import MobileHeader from "@/components/layout/MobileHeader";
import Sidebar from "@/components/layout/Sidebar";
import TickerBar from "@/components/layout/TickerBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar className="hidden w-64 flex-shrink-0 flex-col border-r border-navy-800 bg-navy-950 md:flex" />

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Menüyü kapat"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
          <Sidebar
            className="relative z-10 flex h-full w-64 flex-col border-r border-navy-800 bg-navy-950"
            onNavigate={() => setMenuOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileHeader onMenuClick={() => setMenuOpen(true)} />
        <TickerBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
