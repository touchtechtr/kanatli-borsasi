"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Package,
  Send,
  Share2,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ListingType = "listings" | "feed_listings";
type Company = { id: string; name: string; role: string; status: string };
type Listing = Record<string, unknown> & {
  id: string;
  company_id: string;
  title: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  city: string;
  status: string;
  created_at: string;
};

const allowedTypes: ListingType[] = ["listings", "feed_listings"];
const currency = (value: number) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });

export default function MarketplaceListingDetailPage() {
  const params = useParams<Record<string, string | string[]>>();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const parts = pathname.split("/").filter(Boolean);
  const rawType = params?.type ?? parts.at(-2);
  const rawId = params?.id ?? parts.at(-1);
  const listingType = (
    Array.isArray(rawType) ? rawType[0] : rawType
  ) as ListingType;
  const listingId = Array.isArray(rawId) ? rawId[0] : rawId;
  const validRoute = allowedTypes.includes(listingType) && Boolean(listingId);

  const [listing, setListing] = useState<Listing | null>(null);
  const [seller, setSeller] = useState<{ name: string; role: string } | null>(
    null,
  );
  const [buyer, setBuyer] = useState<Company | null>(null);
  const [buyerAllowed, setBuyerAllowed] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [commissionRate, setCommissionRate] = useState(5);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!validRoute) {
        setErrorMessage("Geçersiz ilan bağlantısı.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from(listingType)
        .select("*")
        .eq("id", listingId)
        .eq("status", "aktif")
        .maybeSingle();
      if (!mounted) return;
      if (error || !data) {
        setErrorMessage(
          error?.message || "İlan bulunamadı veya yayında değil.",
        );
        setLoading(false);
        return;
      }
      const row = data as Listing;
      setListing(row);
      setQuantity(String(row.quantity));
      setPrice(String(row.price));

      const [
        { data: company },
        { data: imageRows },
        { data: settings },
        authResult,
      ] = await Promise.all([
        supabase
          .from("public_companies")
          .select("name, role")
          .eq("id", row.company_id)
          .maybeSingle(),
        supabase
          .from("listing_images")
          .select("public_url")
          .eq("listing_type", listingType)
          .eq("listing_id", listingId)
          .order("position"),
        supabase
          .from("platform_settings")
          .select("trade_commission_rate")
          .eq("id", true)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (!mounted) return;
      setSeller(company ?? null);
      setImages((imageRows ?? []).map((image) => image.public_url));
      setCommissionRate(Number(settings?.trade_commission_rate ?? 5));

      if (authResult.data.user) {
        const { data: buyerCompany } = await supabase
          .from("companies")
          .select("id, name, role, status")
          .eq("user_id", authResult.data.user.id)
          .maybeSingle();
        if (!mounted) return;
        setBuyer(buyerCompany ?? null);
        if (buyerCompany?.id) {
          const activities =
            listingType === "feed_listings"
              ? ["feed_buyer", "animal_buyer"]
              : ["animal_buyer", "feed_buyer"];
          const { data: allowed } = await supabase.rpc(
            "company_has_any_active_activity",
            { p_company_id: buyerCompany.id, p_activity_codes: activities },
          );
          if (mounted) setBuyerAllowed(Boolean(allowed));
        }
      }
      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [listingId, listingType, supabase, validRoute]);

  const offerQuantity = Number(quantity);
  const sellerUnitPrice = Number(price);
  const buyerUnitPrice = sellerUnitPrice * (1 + commissionRate / 100);
  const sellerTotal = offerQuantity * sellerUnitPrice;
  const buyerTotal = offerQuantity * buyerUnitPrice;
  const isOwner = Boolean(listing && buyer?.id === listing.company_id);

  const submitOffer = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!listing) return;
    if (!buyer) {
      router.push("/auth");
      return;
    }
    if (buyer.status !== "onaylandi")
      return setErrorMessage(
        "Teklif vermek için firmanızın onaylanması gerekiyor.",
      );
    if (isOwner)
      return setErrorMessage("Kendi ilanınıza teklif gönderemezsiniz.");
    if (!buyerAllowed)
      return setErrorMessage(
        "Bu ilana teklif vermek için uygun ve onaylı alım faaliyetiniz bulunmalıdır.",
      );
    if (
      !Number.isFinite(offerQuantity) ||
      offerQuantity <= 0 ||
      offerQuantity > Number(listing.quantity)
    )
      return setErrorMessage(
        "Teklif miktarı ilan miktarını aşmamalı ve sıfırdan büyük olmalıdır.",
      );
    if (!Number.isFinite(sellerUnitPrice) || sellerUnitPrice <= 0)
      return setErrorMessage("Geçerli bir birim fiyat girin.");
    setSubmitting(true);
    const { error } = await supabase.from("trade_offers").insert({
      listing_kind: listingType === "feed_listings" ? "feed" : "listing",
      listing_id: listing.id,
      buyer_company_id: buyer.id,
      offered_quantity: offerQuantity,
      offered_unit_price: sellerUnitPrice,
      message: message.trim() || null,
    });
    if (error) setErrorMessage("Teklif gönderilemedi: " + error.message);
    else {
      setSuccessMessage("Teklifiniz yönetim incelemesine gönderildi.");
      setMessage("");
    }
    setSubmitting(false);
  };

  const share = async () => {
    const payload = {
      title: listing?.title || "Kanatlı Borsası ilanı",
      url: window.location.href,
    };
    if (navigator.share) await navigator.share(payload);
    else {
      await navigator.clipboard.writeText(window.location.href);
      setSuccessMessage("İlan bağlantısı kopyalandı.");
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-slate-50 p-14 text-center text-sm text-slate-500">
        İlan yükleniyor…
      </div>
    );
  if (!listing)
    return (
      <main className="min-h-screen bg-slate-50 p-6 marketplace-page">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center">
          <h1 className="text-xl font-extrabold">İlan görüntülenemiyor</h1>
          <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            Ana sayfaya dön
          </Link>
        </div>
      </main>
    );

  const details = [
    ["Kategori", listing.category],
    ["İlan türü", listingType === "feed_listings" ? "Yem ilanı" : "Genel ilan"],
    ["Yem formu", listing.feed_form],
    ["Paketleme", listing.packaging_type],
    [
      "Protein oranı",
      listing.protein_ratio ? `%${listing.protein_ratio}` : null,
    ],
    [
      "Minimum sipariş",
      listing.min_order_quantity
        ? `${listing.min_order_quantity} ${listing.unit}`
        : null,
    ],
    ["Teslimat", listing.delivery_terms],
    ["Ödeme koşulu", listing.payment_terms],
  ].filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700"
          >
            <ArrowLeft className="h-4 w-4" />
            İlanlara dön
          </Link>
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            <Share2 className="h-4 w-4" />
            Paylaş
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            {successMessage}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="relative bg-slate-100">
                {images.length ? (
                  <img
                    src={images[activeImage]}
                    alt={listing.title}
                    className="aspect-[16/9] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-slate-100 via-white to-emerald-50">
                    <Package className="h-16 w-16 text-slate-300" />
                  </div>
                )}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() =>
                        setActiveImage(
                          (activeImage - 1 + images.length) % images.length,
                        )
                      }
                      className="absolute left-3 top-1/2 rounded-full bg-slate-950/65 p-2 text-white"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() =>
                        setActiveImage((activeImage + 1) % images.length)
                      }
                      className="absolute right-3 top-1/2 rounded-full bg-slate-950/65 p-2 text-white"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto p-3">
                  {images.map((url, index) => (
                    <button
                      key={url}
                      onClick={() => setActiveImage(index)}
                      className={`w-20 flex-none overflow-hidden rounded-lg border-2 ${activeImage === index ? "border-emerald-500" : "border-transparent"}`}
                    >
                      <img
                        src={url}
                        alt=""
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
                  {listingType === "feed_listings" ? "Yem ilanı" : "Genel ilan"}
                </span>
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(listing.created_at).toLocaleDateString("tr-TR")}
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-extrabold text-slate-900 sm:text-3xl">
                {listing.title}
              </h1>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {[listing.city, listing.district].filter(Boolean).join(" / ")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {seller?.name || "Doğrulanmış firma"}
                  <BadgeCheck className="h-4 w-4 text-blue-600" />
                </span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric
                  label="Miktar"
                  value={`${Number(listing.quantity).toLocaleString("tr-TR")} ${listing.unit}`}
                />
                <Metric
                  label="Birim fiyat"
                  value={currency(listing.price)}
                  accent
                />
                <Metric
                  label="Tahmini toplam"
                  value={currency(
                    Number(listing.quantity) * Number(listing.price),
                  )}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-extrabold text-slate-900">
                İlan bilgileri
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <Metric
                    key={String(label)}
                    label={String(label)}
                    value={String(value)}
                  />
                ))}
              </div>
              {listing.description ? (
                <>
                  <h3 className="mt-6 text-sm font-bold text-slate-800">
                    Açıklama
                  </h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">
                    {String(listing.description)}
                  </p>
                </>
              ) : null}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm lg:sticky lg:top-5">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Güvenli ticari teklif
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                Teklifinizi gönderin
              </h2>
              <form onSubmit={submitOffer} className="mt-5 space-y-4">
                <Field label={`Miktar (${listing.unit})`}>
                  <input
                    type="number"
                    min="0.01"
                    max={listing.quantity}
                    step="0.01"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="input"
                    required
                  />
                </Field>
                <Field label="Satıcı birim fiyatı (₺)">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="input"
                    required
                  />
                </Field>
                <Field label="Teklif mesajı">
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="input resize-none"
                    placeholder="Teslimat ve ödeme koşullarınızı yazın."
                  />
                </Field>
                <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-xs">
                  <Summary
                    label="Satıcı toplamı"
                    value={currency(sellerTotal)}
                  />
                  <Summary
                    label={`Platform komisyonu (%${commissionRate})`}
                    value={currency(buyerTotal - sellerTotal)}
                  />
                  <Summary
                    label="Alıcı toplamı"
                    value={currency(buyerTotal)}
                    strong
                  />
                </div>
                {isOwner ? (
                  <div className="rounded-xl bg-blue-50 p-3 text-center text-xs font-bold text-blue-700">
                    Bu ilan şirketinize aittir.
                  </div>
                ) : (
                  <button
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? "Gönderiliyor…" : "Teklif gönder"}
                  </button>
                )}
              </form>
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                Teklif, satıcıya iletilmeden önce platform yönetimi tarafından
                incelenir.
              </div>
            </section>
            <section className="rounded-2xl bg-slate-900 p-5 text-white">
              <Truck className="h-5 w-5 text-emerald-400" />
              <h3 className="mt-3 font-extrabold">
                Teslimat koşullarını doğrulayın
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Ödeme öncesinde ürün, miktar, teslimat adresi ve belge
                bilgilerini karşılıklı teyit edin.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-bold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-extrabold ${accent ? "text-emerald-700" : "text-slate-800"}`}
      >
        {value}
      </p>
    </div>
  );
}
function Summary({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${strong ? "border-t border-slate-200 pt-2 font-extrabold text-slate-900" : "text-slate-600"}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
