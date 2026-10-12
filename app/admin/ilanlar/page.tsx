"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, RefreshCw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ListingType = "listings" | "feed_listings" | "livestock_listings";
type ListingRow = {
  id: string;
  type: ListingType;
  title: string;
  company_id: string | null;
  company_name: string;
  city: string;
  quantity: number;
  unit: string;
  price: number;
  status: string;
  moderation_status: string;
  risk_score: number;
  risk_flags: string[];
  created_at: string;
};

const TYPE_LABELS: Record<ListingType, string> = {
  listings: "Genel ilan",
  feed_listings: "Yem ilanı",
  livestock_listings: "Canlı hayvan",
};

const csvValue = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

export default function AdminListingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ListingType>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [moderationFilter, setModerationFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [general, feed, livestock] = await Promise.all([
      supabase
        .from("listings")
        .select(
          "id, company_id, title, city, quantity, unit, price, status, moderation_status, risk_score, risk_flags, created_at",
        ),
      supabase
        .from("feed_listings")
        .select(
          "id, company_id, title, city, quantity, unit, price, status, moderation_status, risk_score, risk_flags, created_at",
        ),
      supabase
        .from("livestock_listings")
        .select(
          "id, company_id, title, city, quantity, unit, price, status, moderation_status, risk_score, risk_flags, created_at",
        ),
    ]);

    const firstError = [general.error, feed.error, livestock.error].find(
      Boolean,
    );
    if (firstError) {
      setError(`İlanlar yüklenemedi: ${firstError?.message}`);
      setLoading(false);
      return;
    }

    const raw = [
      ...(general.data ?? []).map((item) => ({
        ...item,
        type: "listings" as const,
      })),
      ...(feed.data ?? []).map((item) => ({
        ...item,
        type: "feed_listings" as const,
      })),
      ...(livestock.data ?? []).map((item) => ({
        ...item,
        type: "livestock_listings" as const,
      })),
    ];
    const companyIds = [
      ...new Set(raw.map((item) => item.company_id).filter(Boolean)),
    ] as string[];
    const { data: companies, error: companyError } = companyIds.length
      ? await supabase.from("companies").select("id, name").in("id", companyIds)
      : { data: [], error: null };
    if (companyError)
      setError(`Firma adları yüklenemedi: ${companyError.message}`);
    const companyMap = new Map(
      (companies ?? []).map((company) => [company.id, company.name]),
    );

    setRows(
      raw
        .map((item) => ({
          ...item,
          company_name: item.company_id
            ? (companyMap.get(item.company_id) ?? "Bilinmeyen firma")
            : "Bilinmeyen firma",
          city: item.city ?? "—",
          quantity: Number(item.quantity),
          price: Number(item.price),
          unit: item.unit ?? "—",
          status: item.status ?? "—",
          moderation_status: item.moderation_status ?? "otomatik_onaylandi",
          risk_score: Number(item.risk_score ?? 0),
          risk_flags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
        }))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const search = query.trim().toLocaleLowerCase("tr-TR");
        const date = row.created_at.slice(0, 10);
        return (
          (!search ||
            `${row.title} ${row.company_name} ${row.city}`
              .toLocaleLowerCase("tr-TR")
              .includes(search)) &&
          (typeFilter === "all" || row.type === typeFilter) &&
          (statusFilter === "all" || row.status === statusFilter) &&
          (moderationFilter === "all" ||
            row.moderation_status === moderationFilter) &&
          (!dateFrom || date >= dateFrom) &&
          (!dateTo || date <= dateTo)
        );
      }),
    [rows, query, typeFilter, statusFilter, moderationFilter, dateFrom, dateTo],
  );

  const exportCsv = () => {
    const header = [
      "Tür",
      "Başlık",
      "Firma",
      "Şehir",
      "Miktar",
      "Birim",
      "Fiyat",
      "Durum",
      "Moderasyon",
      "Risk puanı",
      "Risk nedenleri",
      "Tarih",
    ];
    const data = filtered.map((row) => [
      TYPE_LABELS[row.type],
      row.title,
      row.company_name,
      row.city,
      row.quantity,
      row.unit,
      row.price,
      row.status,
      row.moderation_status,
      row.risk_score,
      row.risk_flags.join(", "),
      new Date(row.created_at).toLocaleString("tr-TR"),
    ]);
    const blob = new Blob(
      [
        `\uFEFF${[header, ...data].map((line) => line.map(csvValue).join(";")).join("\n")}`,
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ilanlar-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const statuses = [...new Set(rows.map((row) => row.status))];

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              İlan yönetimi
            </p>
            <h1 className="text-3xl font-bold text-slate-950">Tüm İlanlar</h1>
            <p className="mt-1 text-sm text-slate-500">
              Üç ilan kaynağını tek merkezden inceleyin.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void loadListings()}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-bold"
            >
              <RefreshCw className="h-4 w-4" /> Yenile
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
            >
              <Download className="h-4 w-4" /> CSV indir
            </button>
          </div>
        </header>

        <section className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-6">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Başlık, firma veya şehir ara"
              className="w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm"
            />
          </label>
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as "all" | ListingType)
            }
            className="rounded-xl border px-3 text-sm"
          >
            <option value="all">Tüm türler</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border px-3 text-sm"
          >
            <option value="all">Tüm durumlar</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select
            value={moderationFilter}
            onChange={(e) => setModerationFilter(e.target.value)}
            className="rounded-xl border px-3 text-sm"
          >
            <option value="all">Tüm incelemeler</option>
            <option value="inceleme_bekliyor">İnceleme bekleyen</option>
            <option value="otomatik_onaylandi">Otomatik onaylanan</option>
            <option value="onaylandi">Admin onaylı</option>
            <option value="reddedildi">Admin reddetti</option>
          </select>
          <button
            onClick={() => {
              setQuery("");
              setTypeFilter("all");
              setStatusFilter("all");
              setModerationFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
            className="rounded-xl border px-3 py-2 text-sm font-bold"
          >
            Filtreleri temizle
          </button>
          <label className="text-xs text-slate-500">
            Başlangıç
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border p-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            Bitiş
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 w-full rounded-lg border p-2 text-sm"
            />
          </label>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4 text-sm font-bold">
            {loading ? "Yükleniyor…" : `${filtered.length} ilan`}
          </div>
          <div className="divide-y">
            {!loading &&
              filtered.map((row) => (
                <article
                  key={`${row.type}-${row.id}`}
                  className="grid gap-3 px-5 py-4 hover:bg-slate-50 md:grid-cols-[1fr_160px_130px_110px] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold">
                        {TYPE_LABELS[row.type]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                          row.moderation_status === "inceleme_bekliyor"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {row.status}
                      </span>
                      {row.risk_score > 0 && (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">
                          Risk {row.risk_score}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 truncate font-bold text-slate-950">
                      {row.title}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {row.company_name} · {row.city} ·{" "}
                      {new Date(row.created_at).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs text-slate-400">Miktar</p>
                    <b>
                      {row.quantity.toLocaleString("tr-TR")} {row.unit}
                    </b>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs text-slate-400">Birim fiyat</p>
                    <b>
                      {row.price.toLocaleString("tr-TR", {
                        style: "currency",
                        currency: "TRY",
                      })}
                    </b>
                  </div>
                  <Link
                    href={`/admin/ilanlar/${row.type}/${row.id}`}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-100"
                  >
                    Detay <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </article>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}
