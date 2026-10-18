"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Crown,
  ExternalLink,
  MapPin,
  PackageSearch,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PlatformUI";

type ListingType = "listings" | "feed_listings" | "livestock_listings";

type OwnListing = {
  key: string;
  id: string;
  type: ListingType;
  typeLabel: string;
  title: string;
  category: string;
  quantity: number;
  initialQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  expiresAt: string | null;
  unit: string;
  price: number;
  city: string;
  status: string;
  moderationStatus: string;
  riskScore: number;
  createdAt: string;
  detailHref: string | null;
  promotionStatus: string | null;
  promotionName: string | null;
  promotionEndsAt: string | null;
};

type PromotionRow = {
  listing_type: ListingType;
  listing_id: string;
  package_name: string;
  status: string;
  ends_at: string | null;
};

const ALL = "Tümü";

const moderationLabels: Record<string, string> = {
  otomatik_onaylandi: "Otomatik onaylandı",
  inceleme_bekliyor: "İnceleme bekliyor",
  onaylandi: "Admin onaylı",
  reddedildi: "Reddedildi",
};

export default function MyListingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listings, setListings] = useState<OwnListing[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const loadListings = async () => {
    setLoading(true);
    setErrorMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.replace("/auth");
      return;
    }

    const { data: companyData, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id);

    if (companyError) {
      setErrorMessage("Firma bilgileri yüklenemedi: " + companyError.message);
      setLoading(false);
      return;
    }

    const companyIds = (companyData ?? []).map((company) => company.id);
    if (!companyIds.length) {
      setListings([]);
      setLoading(false);
      return;
    }

    const [generalResult, feedResult, livestockResult, promotionResult] =
      await Promise.all([
        supabase
          .from("listings")
          .select(
            "id, title, category, quantity, initial_quantity, reserved_quantity, sold_quantity, expires_at, unit, price, city, status, moderation_status, risk_score, created_at",
          )
          .in("company_id", companyIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("feed_listings")
          .select(
            "id, title, category, quantity, initial_quantity, reserved_quantity, sold_quantity, expires_at, unit, price, city, status, moderation_status, risk_score, created_at",
          )
          .in("company_id", companyIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("livestock_listings")
          .select(
            "id, title, category, quantity, initial_quantity, reserved_quantity, sold_quantity, expires_at, unit, price, city, status, moderation_status, risk_score, created_at",
          )
          .in("company_id", companyIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("listing_promotions")
          .select("listing_type, listing_id, package_name, status, ends_at")
          .in("owner_company_id", companyIds)
          .in("status", ["beklemede", "aktif"])
          .order("created_at", { ascending: false }),
      ]);

    const errors = [
      generalResult.error,
      feedResult.error,
      livestockResult.error,
    ];
    if (errors.every(Boolean)) {
      setErrorMessage(
        "İlanlarınız yüklenemedi: " + errors.find(Boolean)?.message,
      );
      setLoading(false);
      return;
    }

    const promotionRows = (promotionResult.data ?? []) as PromotionRow[];
    const promotionMap = new Map<string, PromotionRow>();
    promotionRows.forEach((promotion) => {
      const key = `${promotion.listing_type}:${promotion.listing_id}`;
      if (!promotionMap.has(key)) promotionMap.set(key, promotion);
    });

    const normalize = (
      rows: Record<string, unknown>[],
      type: ListingType,
      typeLabel: string,
    ): OwnListing[] =>
      rows.map((row) => {
        const key = `${type}:${String(row.id)}`;
        const promotion = promotionMap.get(key);
        return {
          key,
          id: String(row.id),
          type,
          typeLabel,
          title: String(row.title || "İlan"),
          category: String(row.category || "Diğer"),
          quantity: Number(row.quantity || 0),
          initialQuantity: Number(row.initial_quantity || row.quantity || 0),
          reservedQuantity: Number(row.reserved_quantity || 0),
          soldQuantity: Number(row.sold_quantity || 0),
          expiresAt: row.expires_at ? String(row.expires_at) : null,
          unit: String(
            row.unit || (type === "livestock_listings" ? "Baş" : "Birim"),
          ),
          price: Number(row.price || 0),
          city: String(row.city || "—"),
          status: String(row.status || "—"),
          moderationStatus: String(row.moderation_status || "—"),
          riskScore: Number(row.risk_score || 0),
          createdAt: String(row.created_at),
          detailHref:
            type === "livestock_listings"
              ? `/livestock/${String(row.id)}`
              : null,
          promotionStatus: promotion?.status ?? null,
          promotionName: promotion?.package_name ?? null,
          promotionEndsAt: promotion?.ends_at ?? null,
        };
      });

    setListings(
      [
        ...normalize(
          (generalResult.data ?? []) as Record<string, unknown>[],
          "listings",
          "Genel / Yem",
        ),
        ...normalize(
          (feedResult.data ?? []) as Record<string, unknown>[],
          "feed_listings",
          "Yem ilanı",
        ),
        ...normalize(
          (livestockResult.data ?? []) as Record<string, unknown>[],
          "livestock_listings",
          "Canlı hayvan",
        ),
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadListings();
  }, [supabase]);

  const filteredListings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return listings.filter(
      (listing) =>
        (!normalized ||
          `${listing.title} ${listing.category} ${listing.city}`
            .toLocaleLowerCase("tr-TR")
            .includes(normalized)) &&
        (typeFilter === ALL || listing.type === typeFilter) &&
        (statusFilter === ALL || listing.status === statusFilter),
    );
  }, [listings, query, typeFilter, statusFilter]);

  const counts = {
    all: listings.length,
    active: listings.filter((item) => item.status === "aktif").length,
    pending: listings.filter((item) => item.status === "beklemede").length,
    processing: listings.filter((item) => item.status === "islemde").length,
    promoted: listings.filter((item) => item.promotionStatus === "aktif").length,
  };

  return (
    <main className="ui-page-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader eyebrow="İlan ve stok yönetimi" title="İlanlarım" description="İlanlarınızı, kalan miktarı, moderasyon durumunu ve görünürlük paketlerini tek yerden yönetin." icon={PackageSearch} tone="emerald" actions={<><Link href="/profil" className="ui-button ui-button--secondary"><ArrowLeft className="h-4 w-4"/>Hesap merkezi</Link><Link href="/ilan/yeni" className="ui-button ui-button--primary"><Plus className="h-4 w-4"/>Yeni ilan ver</Link></>} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Toplam ilan" value={counts.all} />
          <Stat label="Aktif" value={counts.active} />
          <Stat label="İncelemede" value={counts.pending} />
          <Stat label="İşlemde" value={counts.processing} />
          <Stat label="Öne çıkarılmış" value={counts.promoted} accent />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="İlanlarımda ara"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-400"
              />
            </label>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option>{ALL}</option>
              <option value="listings">Genel / Yem</option>
              <option value="feed_listings">Yem ilanı</option>
              <option value="livestock_listings">Canlı hayvan</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option>{ALL}</option>
              <option value="aktif">Aktif</option>
              <option value="beklemede">Beklemede</option>
              <option value="pasif">Pasif</option>
              <option value="reddedildi">Reddedildi</option>
              <option value="islemde">İşlemde</option>
              <option value="tamamlandi">Tamamlandı</option>
              <option value="suresi_doldu">Süresi doldu</option>
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
              İlanlarınız yükleniyor…
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="p-14 text-center">
              <PackageSearch className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-3 font-bold text-slate-700">İlan bulunamadı</h2>
              <p className="mt-1 text-sm text-slate-400">
                Yeni bir ilan oluşturarak pazarda görünmeye başlayabilirsiniz.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredListings.map((listing) => (
                <article
                  key={listing.key}
                  className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                        {listing.typeLabel}
                      </span>
                      <StatusBadge status={listing.status} />
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                        {moderationLabels[listing.moderationStatus] ||
                          listing.moderationStatus}
                      </span>
                      {listing.riskScore > 0 && (
                        <span className="text-[10px] font-bold text-red-600">
                          Risk {listing.riskScore}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 truncate font-extrabold text-slate-900">
                      {listing.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {listing.city}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {new Date(listing.createdAt).toLocaleDateString(
                          "tr-TR",
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric
                      label="Kalan"
                      value={`${listing.quantity.toLocaleString("tr-TR")} ${listing.unit}`}
                    />
                    <Metric
                      label="Rezerve"
                      value={`${listing.reservedQuantity.toLocaleString("tr-TR")} ${listing.unit}`}
                    />
                    <Metric
                      label="Satılan"
                      value={`${listing.soldQuantity.toLocaleString("tr-TR")} ${listing.unit}`}
                    />
                    <Metric
                      label="Birim fiyat"
                      value={listing.price.toLocaleString("tr-TR", {
                        style: "currency",
                        currency: "TRY",
                      })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 lg:max-w-48 lg:flex-col">
                    <Link
                      href={`/profil/ilanlarim/${listing.type}/${listing.id}`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Yönet
                    </Link>
                    {listing.detailHref && (
                      <Link
                        href={listing.detailHref}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Görüntüle <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {listing.status === "aktif" && (
                      <Link
                        href={`/profil/ilan-promosyonlari?type=${listing.type}&id=${listing.id}`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
                      >
                        <Crown className="h-3.5 w-3.5" />
                        {listing.promotionStatus === "aktif"
                          ? listing.promotionName
                          : listing.promotionStatus === "beklemede"
                            ? "Talep bekliyor"
                            : "Öne çıkar"}
                      </Link>
                    )}
                    {listing.promotionStatus === "aktif" &&
                      listing.promotionEndsAt && (
                        <p className="w-full text-center text-[10px] text-slate-400">
                          Bitiş:{" "}
                          {new Date(listing.promotionEndsAt).toLocaleDateString(
                            "tr-TR",
                          )}
                        </p>
                      )}
                  </div>
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
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${accent ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}
    >
      <p
        className={`text-xs font-semibold ${accent ? "text-amber-700" : "text-slate-500"}`}
      >
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string,string> = {
    aktif: "Yayında",
    pasif: "Yayında değil",
    beklemede: "İnceleme bekliyor",
    reddedildi: "Reddedildi",
    islemde: "İşlemde",
    satildi: "Satıldı",
    tamamlandi: "Tamamlandı",
    iptal: "İptal edildi",
    suresi_doldu: "Süresi doldu",
  };
  const style =
    status === "aktif"
      ? "bg-emerald-100 text-emerald-700"
      : status === "beklemede"
        ? "bg-amber-100 text-amber-700"
        : status === "islemde"
          ? "bg-blue-100 text-blue-700"
          : status === "reddedildi" || status === "iptal"
            ? "bg-red-100 text-red-700"
            : status === "tamamlandi" || status === "satildi"
              ? "bg-violet-100 text-violet-700"
              : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${style}`}>
      {labels[status] || status}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold text-slate-800">
        {value}
      </p>
    </div>
  );
}
