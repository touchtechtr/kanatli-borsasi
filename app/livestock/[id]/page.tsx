"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Listing = {
  id: string;
  company_id: string | null;
  user_id: string;
  animal_type: string;
  category: string;
  breed: string | null;
  title: string;
  quantity: number;
  unit: string | null;
  price: number;
  age_group: string | null;
  average_weight: number | null;
  health_status: string | null;
  vaccination_status: string | null;
  health_certificate: boolean;
  gender: string | null;
  city: string;
  district: string | null;
  description: string | null;
  negotiable: boolean;
  min_order_quantity: number | null;
  delivery_available: boolean;
  delivery_terms: string | null;
  status: string | null;
  created_at: string;
};

type Company = {
  id: string;
  name: string;
  role: string;
  status: string;
};

const currency = (value: number) =>
  Number(value).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });

const formatGender = (value: string | null) => {
  const labels: Record<string, string> = {
    Disi: "Dişi",
    Erkek: "Erkek",
    Karisik: "Karışık",
    Belirtilmedi: "Belirtilmedi",
  };

  return value ? (labels[value] ?? value) : "Belirtilmedi";
};

export default function LivestockDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const listingId = params?.id;

  const [listing, setListing] = useState<Listing | null>(null);
  const [sellerName, setSellerName] = useState("Firma bilgisi gösterilemiyor");
  const [buyerCompany, setBuyerCompany] = useState<Company | null>(null);
  const [hasBuyerActivity, setHasBuyerActivity] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [commissionRate, setCommissionRate] = useState(5);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [offerQuantity, setOfferQuantity] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerMessage, setOfferMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      if (!listingId) return;

      setLoading(true);
      setLoadError(null);

      const { data: listingData, error: listingError } = await supabase
        .from("livestock_listings")
        .select(
          "id, company_id, user_id, animal_type, category, breed, title, quantity, unit, price, age_group, average_weight, health_status, vaccination_status, health_certificate, gender, city, district, description, negotiable, min_order_quantity, delivery_available, delivery_terms, status, created_at",
        )
        .eq("id", listingId)
        .maybeSingle();

      if (!mounted) return;

      if (listingError || !listingData) {
        setLoadError(
          listingError?.message || "İlan bulunamadı veya görüntülenemiyor.",
        );
        setLoading(false);
        return;
      }

      setListing(listingData);
      setOfferQuantity(
        String(listingData.min_order_quantity ?? listingData.quantity),
      );
      setOfferPrice(String(listingData.price));

      let seller: { id: string; name: string } | null = null;

      if (listingData.company_id) {
        const { data: sellerData } = await supabase
          .from("public_companies")
          .select("id, name")
          .eq("id", listingData.company_id)
          .maybeSingle();

        seller = sellerData ?? null;
      }

      const [{ data: settings }, { data: authData }] = await Promise.all([
        supabase
          .from("platform_settings")
          .select("trade_commission_rate")
          .eq("id", true)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);

      if (!mounted) return;

      if (seller?.name) setSellerName(seller.name);
      setCommissionRate(Number(settings?.trade_commission_rate ?? 5));

      const user = authData.user;
      setAuthenticated(Boolean(user));

      if (user) {
        const { data: company } = await supabase
          .from("companies")
          .select("id, name, role, status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!mounted) return;
        setBuyerCompany(company ?? null);

        if (company?.id) {
          const { data: activityAllowed, error: activityError } =
            await supabase.rpc("company_has_active_activity", {
              p_company_id: company.id,
              p_activity_code: "animal_buyer",
            });

          if (!mounted) return;

          if (activityError) {
            console.error(
              "Canlı hayvan alım faaliyeti kontrol edilemedi:",
              activityError.message,
            );
          }

          setHasBuyerActivity(Boolean(activityAllowed));
        } else {
          setHasBuyerActivity(false);
        }
      } else {
        setBuyerCompany(null);
        setHasBuyerActivity(false);
      }

      setLoading(false);
    }

    void loadPage();

    return () => {
      mounted = false;
    };
  }, [listingId, supabase]);

  const quantity = Number(offerQuantity);
  const sellerUnitPrice = Number(offerPrice);
  const commissionUnitAmount = (sellerUnitPrice * commissionRate) / 100;
  const buyerUnitPrice = sellerUnitPrice + commissionUnitAmount;
  const sellerTotal = quantity * sellerUnitPrice;
  const commissionTotal = quantity * commissionUnitAmount;
  const buyerTotal = sellerTotal + commissionTotal;

  const isOwner = Boolean(
    listing?.company_id && buyerCompany?.id === listing.company_id,
  );
  const isApprovedBuyer = Boolean(
    hasBuyerActivity && buyerCompany?.status === "onaylandi",
  );

  const handleOfferSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSuccessMessage(null);

    if (!authenticated) {
      router.push("/auth");
      return;
    }

    if (!listing || !buyerCompany) {
      alert("Teklif vermeden önce firma profilinizi oluşturmalısınız.");
      router.push("/profil/sirket");
      return;
    }

    if (buyerCompany.status !== "onaylandi") {
      alert(
        buyerCompany.status === "reddedildi"
          ? "Firma başvurunuz reddedildiği için teklif gönderemezsiniz."
          : "Teklif göndermek için firmanızın yönetici tarafından onaylanması gerekiyor.",
      );
      return;
    }

    if (!hasBuyerActivity) {
      alert(
        "Bu ilana teklif verebilmek için onaylı “Canlı Hayvan Alıcısı / Tüccarı” faaliyetiniz bulunmalıdır.",
      );
      router.push("/profil/faaliyetler");
      return;
    }

    if (isOwner) {
      alert("Kendi ilanınıza teklif gönderemezsiniz.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("Geçerli bir teklif miktarı girin.");
      return;
    }

    if (quantity > Number(listing.quantity)) {
      alert(
        `Teklif miktarı ilan miktarını (${listing.quantity} ${listing.unit || "Baş"}) aşamaz.`,
      );
      return;
    }

    if (quantity < Number(listing.min_order_quantity ?? 1)) {
      alert(
        `Teklif miktarı minimum ${listing.min_order_quantity ?? 1} ${listing.unit || "Baş"} olmalıdır.`,
      );
      return;
    }

    if (!Number.isFinite(sellerUnitPrice) || sellerUnitPrice <= 0) {
      alert("Geçerli bir birim fiyat girin.");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from("trade_offers").insert({
      listing_kind: "livestock",
      listing_id: listing.id,
      buyer_company_id: buyerCompany.id,
      offered_quantity: quantity,
      offered_unit_price: sellerUnitPrice,
      message: offerMessage.trim() || null,
    });

    if (error) {
      alert("Teklif gönderilemedi: " + error.message);
    } else {
      setSuccessMessage(
        "Teklifiniz oluşturuldu ve yönetici incelemesine gönderildi. Sonucu bildirimlerinizden takip edebilirsiniz.",
      );
      setOfferMessage("");
    }

    setSubmitting(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-12">
        <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          İlan bilgileri yükleniyor...
        </div>
      </main>
    );
  }

  if (loadError || !listing) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-12">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            İlan görüntülenemedi
          </h1>
          <p className="mt-2 text-sm text-red-700">{loadError}</p>
          <Link
            href="/livestock"
            className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            İlanlara dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/livestock"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Canlı hayvan ilanlarına dön
        </Link>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-7 text-white md:p-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                {listing.category}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-200">
                <MapPin className="h-3.5 w-3.5" />
                {[listing.city, listing.district].filter(Boolean).join(" / ")}
              </span>
              {listing.status === "aktif" && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                  Aktif ilan
                </span>
              )}
            </div>

            <h1 className="mt-5 max-w-4xl text-3xl font-extrabold leading-tight md:text-4xl">
              {listing.title}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {sellerName}
              </span>
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                {new Date(listing.created_at).toLocaleDateString("tr-TR")}
              </span>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_360px] md:p-8">
            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-bold text-slate-900">
                  İlan bilgileri
                </h2>
                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DetailItem label="Canlı grubu" value={listing.animal_type} />
                  <DetailItem
                    label="Irk / çeşit"
                    value={listing.breed || "Belirtilmedi"}
                  />
                  <DetailItem
                    label="Yaş / dönem"
                    value={listing.age_group || "Belirtilmedi"}
                  />
                  <DetailItem
                    label="Cinsiyet"
                    value={formatGender(listing.gender)}
                  />
                  <DetailItem
                    label="Ortalama ağırlık"
                    value={
                      listing.average_weight
                        ? `${Number(listing.average_weight).toLocaleString("tr-TR")} kg`
                        : "Belirtilmedi"
                    }
                    icon={<Scale className="h-4 w-4" />}
                  />
                  <DetailItem
                    label="Toplam miktar"
                    value={`${Number(listing.quantity).toLocaleString("tr-TR")} ${listing.unit || "Baş"}`}
                  />
                  <DetailItem
                    label="Minimum sipariş"
                    value={`${Number(listing.min_order_quantity ?? 1).toLocaleString("tr-TR")} ${listing.unit || "Baş"}`}
                  />
                  <DetailItem
                    label="İlan birim fiyatı"
                    value={currency(listing.price)}
                  />
                  <DetailItem
                    label="Pazarlık"
                    value={
                      listing.negotiable ? "Pazarlığa açık" : "Sabit fiyat"
                    }
                  />
                </dl>
              </section>

              {listing.description && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="font-bold text-slate-900">İlan açıklaması</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">
                    {listing.description}
                  </p>
                </section>
              )}

              <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
                  <div>
                    <h2 className="font-bold text-blue-950">Sağlık bilgisi</h2>
                    <p className="mt-1 text-sm leading-6 text-blue-800">
                      {listing.health_status ||
                        "İlan sahibi sağlık durumu bilgisi girmemiştir."}
                    </p>
                    <p className="mt-2 text-xs text-blue-700">
                      Aşı durumu: {listing.vaccination_status || "Belirtilmedi"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-blue-800">
                      Sağlık sertifikası:{" "}
                      {listing.health_certificate ? "Mevcut" : "Belirtilmedi"}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold text-slate-900">Teslimat</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {listing.delivery_available
                        ? "Satıcı teslimat desteği sunuyor."
                        : "Nakliye ve teslimat alıcı ile satıcı arasında belirlenir."}
                    </p>
                  </div>
                </div>
                {listing.delivery_terms && (
                  <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                    {listing.delivery_terms}
                  </p>
                )}
              </section>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
                <strong>Hatırlatma:</strong> İlan bilgilerini ve hayvanların
                sağlık belgelerini işlem öncesinde satıcıdan doğrulayın.
                Platformdaki fiyatlar ve açıklamalar ilan sahibinin beyanıdır.
              </div>
            </div>

            <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Güvenli teklif akışı
                </span>
              </div>

              {successMessage ? (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <p className="mt-2 text-sm leading-6 text-emerald-800">
                    {successMessage}
                  </p>
                  <Link
                    href="/tuccar-paneli"
                    className="mt-3 inline-flex text-sm font-semibold text-emerald-700 underline underline-offset-4"
                  >
                    Tekliflerimi görüntüle
                  </Link>
                </div>
              ) : isOwner ? (
                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  Bu ilan firmanıza aittir. Kendi ilanınıza teklif
                  gönderemezsiniz.
                </div>
              ) : !authenticated ? (
                <div className="mt-5">
                  <p className="text-sm leading-6 text-slate-600">
                    Teklif göndermek için giriş yapın. Firmanızda onaylı canlı
                    hayvan alım faaliyeti bulunmalıdır.
                  </p>
                  <Link
                    href="/auth"
                    className="mt-4 inline-flex w-full justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Giriş yap ve teklif ver
                  </Link>
                </div>
              ) : !isApprovedBuyer ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  {!buyerCompany
                    ? "Teklif vermek için önce firma profilinizi oluşturun."
                    : buyerCompany.status !== "onaylandi"
                      ? "Teklif vermek için firmanızın yönetici tarafından onaylanması gerekir."
                      : "Bu ilana teklif verebilmek için Canlı Hayvan Alıcısı / Tüccarı faaliyetinizin onaylanması gerekir."}
                  <Link
                    href={
                      buyerCompany?.status === "onaylandi"
                        ? "/profil/faaliyetler"
                        : "/profil/sirket"
                    }
                    className="mt-3 block font-semibold underline underline-offset-4"
                  >
                    {buyerCompany?.status === "onaylandi"
                      ? "Faaliyetlerime git"
                      : "Şirket bilgilerime git"}
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleOfferSubmit} className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Teklif miktarı ({listing.unit || "Baş"})
                    </label>
                    <input
                      type="number"
                      min={listing.min_order_quantity ?? 1}
                      max={listing.quantity}
                      step="0.01"
                      required
                      value={offerQuantity}
                      onChange={(event) => setOfferQuantity(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Satıcıya teklif edilen birim fiyat
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={offerPrice}
                      onChange={(event) => setOfferPrice(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Mesajınız
                    </label>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={offerMessage}
                      onChange={(event) => setOfferMessage(event.target.value)}
                      placeholder="Teslimat, tarih veya diğer koşulları yazabilirsiniz."
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
                    <PriceRow
                      label="Satıcı birim fiyatı"
                      value={currency(sellerUnitPrice || 0)}
                    />
                    <PriceRow
                      label={`Komisyon (%${commissionRate})`}
                      value={currency(commissionTotal || 0)}
                    />
                    <PriceRow
                      label="Komisyonlu birim fiyat"
                      value={currency(buyerUnitPrice || 0)}
                    />
                    <PriceRow
                      label="Satıcıya ödenecek"
                      value={currency(sellerTotal || 0)}
                    />
                    <PriceRow
                      label="Alıcı toplamı"
                      value={currency(buyerTotal || 0)}
                      strong
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || listing.status !== "aktif"}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting
                      ? "Teklif gönderiliyor..."
                      : "Teklifi yönetime gönder"}
                  </button>

                  <p className="text-[11px] leading-5 text-slate-500">
                    Teklif önce yönetici incelemesine alınır. Onaylandıktan
                    sonra ilan sahibine iletilir.
                  </p>
                </form>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function DetailItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 font-bold text-slate-900">{value}</dd>
    </div>
  );
}

function PriceRow({
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
      className={`flex items-center justify-between gap-3 ${strong ? "border-t border-slate-200 pt-2 text-sm font-bold text-slate-900" : "text-slate-600"}`}
    >
      <span>{label}</span>
      <span
        className={strong ? "text-emerald-700" : "font-semibold text-slate-800"}
      >
        {value}
      </span>
    </div>
  );
}
