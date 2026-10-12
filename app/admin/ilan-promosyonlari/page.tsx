"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Crown,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";

type Promotion = {
  id: string;
  listing_type: string;
  listing_id: string;
  owner_company_id: string;
  package_name: string;
  amount: number;
  duration_days: number;
  status: string;
  payment_status: string;
  starts_at: string | null;
  ends_at: string | null;
  admin_note: string | null;
  created_at: string;
  companyName: string;
  listingTitle: string;
};

const typeNames: Record<string, string> = {
  listings: "Genel / Yem",
  feed_listings: "Yem ilanı",
  livestock_listings: "Canlı hayvan",
};

export default function AdminListingPromotionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("beklemede");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRows = async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("listing_promotions")
      .select(
        "id, listing_type, listing_id, owner_company_id, package_name, amount, duration_days, status, payment_status, starts_at, ends_at, admin_note, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage("Öne çıkarma talepleri yüklenemedi: " + error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const promotions = data ?? [];
    const companyIds = [
      ...new Set(promotions.map((row) => row.owner_company_id)),
    ];
    const companyResult = companyIds.length
      ? await supabase
          .from("public_companies")
          .select("id, name")
          .in("id", companyIds)
      : { data: [], error: null };

    const companyMap = new Map(
      (companyResult.data ?? []).map((company) => [company.id, company.name]),
    );
    const titleMap = new Map<string, string>();

    await Promise.all(
      (["listings", "feed_listings", "livestock_listings"] as const).map(
        async (table) => {
          const ids = promotions
            .filter((row) => row.listing_type === table)
            .map((row) => row.listing_id);
          if (!ids.length) return;
          const result = await supabase
            .from(table)
            .select("id, title")
            .in("id", ids);
          (result.data ?? []).forEach((listing) =>
            titleMap.set(`${table}:${listing.id}`, listing.title),
          );
        },
      ),
    );

    setRows(
      promotions.map((row) => ({
        ...row,
        companyName: companyMap.get(row.owner_company_id) || "Firma",
        listingTitle:
          titleMap.get(`${row.listing_type}:${row.listing_id}`) || "İlan",
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadRows();
  }, [supabase]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return rows.filter(
      (row) =>
        (statusFilter === "all" || row.status === statusFilter) &&
        (!normalized ||
          `${row.listingTitle} ${row.companyName} ${row.package_name}`
            .toLocaleLowerCase("tr-TR")
            .includes(normalized)),
    );
  }, [rows, query, statusFilter]);

  const review = async (row: Promotion, decision: "onayla" | "reddet") => {
    const defaultNote =
      decision === "onayla"
        ? "Ödeme doğrulandı ve öne çıkarma paketi etkinleştirildi."
        : "Ödeme veya ilan bilgileri doğrulanamadığı için talep reddedildi.";
    const note = window.prompt("Yönetim notu:", defaultNote);
    if (note === null) return;

    setProcessingId(row.id);
    const { error } = await supabase.rpc("admin_review_listing_promotion", {
      promotion_id: row.id,
      decision,
      review_note: note,
    });

    if (error) alert("İşlem tamamlanamadı: " + error.message);
    else {
      await dispatchNotificationEmails(supabase);
      await loadRows();
    }
    setProcessingId(null);
  };

  const stats = {
    pending: rows.filter((row) => row.status === "beklemede").length,
    active: rows.filter((row) => row.status === "aktif").length,
    rejected: rows.filter((row) => row.status === "reddedildi").length,
    revenue: rows
      .filter((row) => row.payment_status === "odendi")
      .reduce((sum, row) => sum + Number(row.amount), 0),
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
              Gelir ve görünürlük
            </p>
            <h1 className="mt-1 text-3xl font-extrabold text-slate-900">
              İlan Öne Çıkarma
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Paket taleplerini ve ödeme doğrulamasını yönetin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRows()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Yenile
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Onay bekleyen" value={stats.pending} tone="amber" />
          <Stat label="Aktif paket" value={stats.active} tone="emerald" />
          <Stat label="Reddedilen" value={stats.rejected} tone="red" />
          <Stat
            label="Doğrulanan tutar"
            value={stats.revenue.toLocaleString("tr-TR", {
              style: "currency",
              currency: "TRY",
            })}
            tone="blue"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="İlan, firma veya paket ara"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-400"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="all">Tüm durumlar</option>
              <option value="beklemede">Onay bekleyen</option>
              <option value="aktif">Aktif</option>
              <option value="reddedildi">Reddedilen</option>
              <option value="suresi_doldu">Süresi dolan</option>
            </select>
          </div>
        </section>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-14 text-center text-sm text-slate-400">
              Talepler yükleniyor…
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-14 text-center">
              <Crown className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Filtreye uygun talep bulunamadı.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <article
                  key={row.id}
                  className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                        {typeNames[row.listing_type] || row.listing_type}
                      </span>
                      <StatusBadge status={row.status} />
                    </div>
                    <h2 className="mt-2 font-extrabold text-slate-900">
                      {row.listingTitle}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.companyName} ·{" "}
                      {new Date(row.created_at).toLocaleString("tr-TR")}
                    </p>
                    {row.admin_note && (
                      <p className="mt-2 text-xs text-slate-600">
                        Yönetim notu: {row.admin_note}
                      </p>
                    )}
                  </div>
                  <div className="min-w-40 rounded-xl bg-amber-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase text-amber-700">
                      {row.package_name}
                    </p>
                    <p className="mt-1 text-lg font-extrabold text-slate-900">
                      {Number(row.amount).toLocaleString("tr-TR", {
                        style: "currency",
                        currency: "TRY",
                      })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.duration_days} gün
                    </p>
                  </div>
                  {row.status === "beklemede" ? (
                    <div className="flex gap-2">
                      <button
                        disabled={processingId === row.id}
                        onClick={() => void review(row, "reddet")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" /> Reddet
                      </button>
                      <button
                        disabled={processingId === row.id}
                        onClick={() => void review(row, "onayla")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Ödemeyi doğrula ve
                        etkinleştir
                      </button>
                    </div>
                  ) : (
                    <div className="text-right text-xs text-slate-500">
                      {row.ends_at
                        ? `Bitiş: ${new Date(row.ends_at).toLocaleString("tr-TR")}`
                        : "—"}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "amber" | "emerald" | "red" | "blue";
}) {
  const styles = {
    amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-800",
    red: "bg-red-50 text-red-800",
    blue: "bg-blue-50 text-blue-800",
  };
  return (
    <div
      className={`rounded-2xl border border-white p-4 shadow-sm ${styles[tone]}`}
    >
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "aktif"
      ? "bg-emerald-100 text-emerald-700"
      : status === "beklemede"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${styles}`}
    >
      {status === "beklemede" && <Clock3 className="h-3 w-3" />}
      {status}
    </span>
  );
}
