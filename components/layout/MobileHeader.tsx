"use client";

import { Feather, Menu } from "lucide-react";

type MobileHeaderProps = {
  onMenuClick: () => void;
};

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="flex h-14 w-full shrink-0 items-center gap-3 border-b border-navy-800 bg-navy-950 px-4 md:hidden">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Menüyü aç"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-navy-800"
      >
        <Menu className="h-6 w-6" strokeWidth={2} />
      </button>
      <div className="flex items-center gap-2">
        <Feather className="h-5 w-5 text-tarim-500" strokeWidth={2.5} />
        <span className="text-base font-semibold tracking-tight text-white">
          Kanatlı<span className="text-tarim-500">Borsa</span>
        </span>
      </div>
    </header>
  );
}
