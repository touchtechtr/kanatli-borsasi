"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function FloatingQuickActions() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isPlatformStaff, setIsPlatformStaff] = useState(pathname.startsWith("/admin"));

  useEffect(() => {
    let active = true;
    void supabase.rpc("get_my_platform_access").then(({ data }) => {
      if (active) setIsPlatformStaff(Boolean(data?.is_staff && data?.active));
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  const scrollToTop = () => {
    const container = document.getElementById("app-scroll-container");
    if (container) {
      container.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openSearch = () => {
    if (pathname === "/") {
      router.push("/?search=1#ilan-arama");
    } else {
      router.push("/?search=1#ilan-arama");
    }
  };

  const itemClass =
    "group relative flex h-11 w-11 items-center justify-center rounded-xl border text-white shadow-lg transition hover:-translate-y-0.5 focus:outline-none focus:ring-4";

  return (
    <div className="fixed bottom-5 right-4 z-50 flex flex-col gap-2 rounded-2xl border border-white/70 bg-white/55 p-2 shadow-[0_18px_55px_-18px_rgba(15,23,42,.45)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/45 sm:bottom-7 sm:right-7">
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Sayfanın başına dön"
        className={itemClass + " border-slate-500/30 bg-slate-900/80 hover:bg-slate-900 focus:ring-slate-200"}
      >
        <ArrowUp className="h-5 w-5" />
        <Hint>Yukarı çık</Hint>
      </button>

      {isPlatformStaff ? (
        <button
          type="button"
          onClick={() => alert("Platform personeli ilan oluşturamaz. İlan vermek için ayrı bir şirket hesabıyla giriş yapın.")}
          aria-label="İlan ver"
          className={itemClass + " border-emerald-200/80 bg-emerald-500/85 hover:bg-emerald-500 focus:ring-emerald-100"}
        >
          <Plus className="h-5 w-5" />
          <Hint tone="emerald">Şirket hesabıyla ilan ver</Hint>
        </button>
      ) : (
        <Link
          href="/ilan/yeni"
          aria-label="İlan ver"
          className={itemClass + " border-emerald-200/80 bg-emerald-500/85 hover:bg-emerald-500 focus:ring-emerald-100"}
        >
          <Plus className="h-5 w-5" />
          <Hint tone="emerald">İlan ver</Hint>
        </Link>
      )}

      <button
        type="button"
        onClick={openSearch}
        aria-label="İlan ara"
        className={itemClass + " border-cyan-200/80 bg-cyan-500/80 hover:bg-cyan-500 focus:ring-cyan-100"}
      >
        <Search className="h-5 w-5" />
        <Hint tone="cyan">İlan ara ve filtrele</Hint>
      </button>
    </div>
  );
}

function Hint({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "emerald" | "cyan";
}) {
  const tones = {
    slate: "border-white/60 bg-slate-950/90",
    emerald: "border-emerald-200/60 bg-emerald-950/90",
    cyan: "border-cyan-200/60 bg-cyan-950/90",
  };
  return (
    <span className={`pointer-events-none absolute right-14 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-bold text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 group-focus:opacity-100 ${tones[tone]}`}>
      {children}
    </span>
  );
}
