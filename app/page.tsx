"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BookOpenText,
  Building2,
  CalendarDays,
  ChevronRight,
  Crown,
  Filter,
  MapPin,
  LogIn,
  Microscope,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";
import ListingImagePicker from "@/components/listings/ListingImagePicker";
import { uploadListingImages } from "@/lib/listing-images";

type ListingSource = "listings" | "feed_listings" | "livestock_listings";
type OfferKind = "listing" | "feed" | "livestock";
type MarketView = "all" | "feed" | "livestock" | "agri" | "other" | "slaughterhouse";

type Company = {
  id: string;
  name: string;
  role: string;
  status: "beklemede" | "onaylandi" | "reddedildi";
};

type PublicCompany = {
  id: string;
  name: string;
  role: string;
};

type UnifiedListing = {
  key: string;
  id: string;
  source: ListingSource;
  offerKind: OfferKind;
  typeLabel: string;
  title: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  city: string;
  district: string | null;
  createdAt: string;
  companyId: string;
  companyName: string;
  companyRole: string;
  detailHref: string | null;
  extraLabel: string | null;
  isFeatured: boolean;
  isHighlighted: boolean;
  isUrgent: boolean;
  priority: number;
  promotionEndsAt: string | null;
  imageUrl: string | null;
};

type PromotionRow = {
  listing_type: ListingSource;
  listing_id: string;
  priority: number;
  is_featured: boolean;
  is_highlighted: boolean;
  is_urgent: boolean;
  ends_at: string;
};

type SlaughterhouseRequest = {
  id: string;
  title: string;
  animal_type: string;
  quantity_required: number;
  target_price: number | null;
  city: string;
  delivery_start: string;
  delivery_end: string;
  company_id: string;
  company_name: string;
  created_at: string;
};

type MarketPrice = {
  id: string;
  item_name: string;
  price: number;
  unit: string;
  exchange_source: string;
  change_rate: number;
};

type OfferForm = {
  listing: UnifiedListing;
  quantity: string;
  price: string;
  message: string;
};

const ALL = "Tümü";
const PAGE_SIZE = 12;
const FEED_CATEGORIES = ["Broyler (Etlik) Yemleri", "Yumurta Tavuğu Yemleri", "Hammadde & Tahıllar", "Katkı Maddeleri"];
const AGRI_CATEGORIES = ["Gübre & Bitki Besleme", "Tohum & Fide", "Bitki Koruma Ürünleri", "Sulama & Tarım Ekipmanları", "Sera & Üretim Malzemeleri"];

const TYPE_OPTIONS = [
  { value: ALL, label: "Tüm ilanlar" },
  { value: "listings", label: "Genel / Yem" },
  { value: "feed_listings", label: "Yem ilanı" },
  { value: "livestock_listings", label: "Canlı hayvan" },
];

const typeStyles: Record<ListingSource, string> = {
  listings: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  feed_listings: "bg-amber-50 text-amber-700 ring-amber-200",
  livestock_listings: "bg-blue-50 text-blue-700 ring-blue-200",
};

function money(value: number) {
  return Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listings, setListings] = useState<UnifiedListing[]>([]);
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<SlaughterhouseRequest[]>([]);
  const [marketView, setMarketView] = useState<MarketView>("all");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [isPlatformStaff, setIsPlatformStaff] = useState(false);
  const [userCompanyId, setUserCompanyId] = useState("");

  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [cityFilter, setCityFilter] = useState(ALL);
  const [sortOrder, setSortOrder] = useState("recommended");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [showListingTypeModal, setShowListingTypeModal] = useState(false);
  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const [generalListingMode, setGeneralListingMode] = useState<"feed" | "agri">("feed");
  const [offerForm, setOfferForm] = useState<OfferForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generalImageFiles, setGeneralImageFiles] = useState<File[]>([]);

  const [newListing, setNewListing] = useState({
    title: "",
    category: "Broyler (Etlik) Yemleri",
    quantity: "",
    unit: "Ton / Çuval",
    price: "",
    city: "Antalya",
  });

  const loadMarketplace = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    setErrorMessage(null);

    const [
      generalResult,
      feedResult,
      livestockResult,
      priceResult,
      promotionResult,
      purchaseRequestResult,
    ] = await Promise.all([
      supabase
        .from("listings")
        .select(
          "id, company_id, title, category, quantity, unit, price, city, created_at",
        )
        .eq("status", "aktif")
        .order("created_at", { ascending: false }),
      supabase
        .from("feed_listings")
        .select(
          "id, company_id, title, category, quantity, unit, price, city, district, feed_form, packaging_type, created_at",
        )
        .eq("status", "aktif")
        .order("created_at", { ascending: false }),
      supabase
        .from("livestock_listings")
        .select(
          "id, company_id, title, animal_type, category, breed, quantity, unit, price, city, district, created_at",
        )
        .eq("status", "aktif")
        .order("created_at", { ascending: false }),
      supabase
        .from("market_prices")
        .select("id, item_name, price, unit, exchange_source, change_rate")
        .order("item_name", { ascending: true }),
      supabase
        .from("listing_promotions")
        .select(
          "listing_type, listing_id, priority, is_featured, is_highlighted, is_urgent, ends_at",
        )
        .eq("status", "aktif")
        .eq("payment_status", "odendi")
        .gt("ends_at", new Date().toISOString()),
      supabase
        .from("public_slaughterhouse_purchase_requests")
        .select("id,title,animal_type,quantity_required,target_price,city,delivery_start,delivery_end,company_id,created_at")
        .order("created_at", { ascending: false }),
    ]);

    const listingErrors = [
      generalResult.error,
      feedResult.error,
      livestockResult.error,
    ].filter(Boolean);

    if (listingErrors.length === 3) {
      setListings([]);
      setErrorMessage(
        "İlanlar şu anda yüklenemedi. Lütfen biraz sonra yeniden deneyin.",
      );
      setLoading(false);
      setRefreshing(false);
      return;
    }

    listingErrors.forEach((error) => {
      if (error) console.error("İlan kaynağı yüklenemedi:", error.message);
    });

    if (promotionResult.error && promotionResult.error.code !== "42P01") {
      console.warn(
        "İlan öne çıkarma bilgileri yüklenemedi:",
        promotionResult.error.message,
      );
    }

    const promotions = (promotionResult.data ?? []) as PromotionRow[];
    const promotionMap = new Map<string, PromotionRow[]>();

    promotions.forEach((promotion) => {
      const key = `${promotion.listing_type}:${promotion.listing_id}`;
      promotionMap.set(key, [...(promotionMap.get(key) ?? []), promotion]);
    });

    const rawListings = [
      ...(generalResult.data ?? []).map((item) => ({
        ...item,
        source: "listings" as const,
        offerKind: "listing" as const,
        typeLabel: "Genel / Yem",
        category: item.category,
        district: null,
        detailHref: `/ilan/listings/${item.id}`,
        extraLabel: null,
      })),
      ...(feedResult.data ?? []).map((item) => ({
        ...item,
        source: "feed_listings" as const,
        offerKind: "feed" as const,
        typeLabel: "Yem İlanı",
        category: item.category,
        detailHref: `/ilan/feed_listings/${item.id}`,
        extraLabel:
          [item.feed_form, item.packaging_type].filter(Boolean).join(" · ") ||
          null,
      })),
      ...(livestockResult.data ?? []).map((item) => ({
        ...item,
        source: "livestock_listings" as const,
        offerKind: "livestock" as const,
        typeLabel: "Canlı Hayvan",
        category: item.category || item.animal_type,
        detailHref: `/livestock/${item.id}`,
        extraLabel:
          [item.animal_type, item.breed].filter(Boolean).join(" · ") || null,
      })),
    ];

    const companyIds = [
      ...new Set([
        ...rawListings.map((item) => item.company_id),
        ...(purchaseRequestResult.data ?? []).map((item) => item.company_id),
      ].filter(Boolean)),
    ];

    const listingIds = rawListings.map((item) => item.id);
    const imageResult = listingIds.length
      ? await supabase
          .from("listing_images")
          .select("listing_type, listing_id, public_url, position, is_primary")
          .in("listing_id", listingIds)
          .order("position")
      : { data: [], error: null };
    const imageMap = new Map<string, string>();
    for (const image of imageResult.data ?? []) {
      const imageKey = `${image.listing_type}:${image.listing_id}`;
      if (!imageMap.has(imageKey) || image.is_primary) {
        imageMap.set(imageKey, image.public_url);
      }
    }

    const companyResult = companyIds.length
      ? await supabase
          .from("public_companies")
          .select("id, name, role")
          .in("id", companyIds)
      : { data: [] as PublicCompany[], error: null };

    if (companyResult.error) {
      console.warn("Firma bilgileri yüklenemedi:", companyResult.error.message);
    }

    const companyMap = new Map(
      ((companyResult.data ?? []) as PublicCompany[]).map((company) => [
        company.id,
        company,
      ]),
    );

    const unified: UnifiedListing[] = rawListings.map((item) => {
      const key = `${item.source}:${item.id}`;
      const itemPromotions = promotionMap.get(key) ?? [];
      const company = companyMap.get(item.company_id);

      return {
        key,
        id: item.id,
        source: item.source,
        offerKind: item.offerKind,
        typeLabel: item.typeLabel,
        title: item.title,
        category: item.category,
        quantity: Number(item.quantity),
        unit:
          item.unit || (item.source === "livestock_listings" ? "Baş" : "Birim"),
        price: Number(item.price),
        city: item.city,
        district: item.district,
        createdAt: item.created_at,
        companyId: item.company_id,
        companyName: company?.name || "Doğrulanmış firma",
        companyRole: company?.role || "",
        detailHref: item.detailHref,
        extraLabel: item.extraLabel,
        isFeatured: itemPromotions.some((promotion) => promotion.is_featured),
        isHighlighted: itemPromotions.some(
          (promotion) => promotion.is_highlighted,
        ),
        isUrgent: itemPromotions.some((promotion) => promotion.is_urgent),
        priority: Math.max(
          0,
          ...itemPromotions.map((promotion) => promotion.priority),
        ),
        promotionEndsAt:
          itemPromotions.sort((a, b) => b.priority - a.priority)[0]?.ends_at ??
          null,
        imageUrl: imageMap.get(key) ?? null,
      };
    });

    setListings(unified);
    setPurchaseRequests((purchaseRequestResult.data ?? []).map((item) => ({
      ...item,
      quantity_required: Number(item.quantity_required),
      target_price: item.target_price == null ? null : Number(item.target_price),
      company_name: companyMap.get(item.company_id)?.name || "Doğrulanmış kesimhane",
    })) as SlaughterhouseRequest[]);
    if (purchaseRequestResult.error) console.warn("Kesimhane alım talepleri yüklenemedi:", purchaseRequestResult.error.message);
    setMarketPrices((priceResult.data ?? []) as MarketPrice[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      setMounted(true);
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (currentUser) {
        setUser({ id: currentUser.id });
        const [{ data: companyData }, { data: platformAccess }] =
          await Promise.all([
            supabase
              .from("companies")
              .select("id, name, role, status")
              .eq("user_id", currentUser.id)
              .order("name"),
            supabase.rpc("get_my_platform_access"),
          ]);

        if (!active) return;
        const staff = Boolean(
          platformAccess?.is_staff && platformAccess?.active,
        );
        setIsPlatformStaff(staff);
        const ownCompanies = staff ? [] : ((companyData ?? []) as Company[]);
        setCompanies(ownCompanies);
        setUserCompanyId(ownCompanies[0]?.id ?? "");

        if (
          !staff &&
          ["1", "general", "agri"].includes(
            new URLSearchParams(window.location.search).get("newListing") ?? "",
          )
        ) {
          const requested = new URLSearchParams(window.location.search).get("newListing");
          if (requested === "general" || requested === "agri") {
            const mode = requested === "agri" ? "agri" : "feed";
            setGeneralListingMode(mode);
            setNewListing((current) => ({
              ...current,
              category:
                mode === "agri"
                  ? "Gübre & Bitki Besleme"
                  : "Broyler (Etlik) Yemleri",
              unit: mode === "agri" ? "Adet / Paket" : "Ton / Çuval",
            }));
            setShowGeneralForm(true);
          }
          else setShowListingTypeModal(true);
        }
      }

      await loadMarketplace();
    };

    void initialize();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    const requestedMarket = searchParams.get("market");
    if (["feed", "livestock", "agri", "other", "slaughterhouse"].includes(requestedMarket ?? "")) {
      setMarketView(requestedMarket as MarketView);
    } else {
      setMarketView("all");
    }
    if (searchParams.get("search") === "1") {
      setShowSearch(true);
      window.setTimeout(() => document.getElementById("ilan-arama")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  }, [searchParams]);

  const categories = useMemo(
    () => [
      ALL,
      ...Array.from(
        new Set(listings.map((item) => item.category).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "tr")),
    ],
    [listings],
  );

  const cities = useMemo(
    () => [
      ALL,
      ...Array.from(
        new Set(listings.map((item) => item.city).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "tr")),
    ],
    [listings],
  );

  const filteredListings = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

    const result = listings.filter((item) => {
      const searchable = [
        item.title,
        item.category,
        item.companyName,
        item.city,
        item.district,
        item.extraLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (typeFilter === ALL || item.source === typeFilter) &&
        (categoryFilter === ALL || item.category === categoryFilter) &&
        (cityFilter === ALL || item.city === cityFilter)
      );
    });

    return result.sort((a, b) => {
      if (sortOrder === "newest") {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      if (sortOrder === "price_asc") return a.price - b.price;
      if (sortOrder === "price_desc") return b.price - a.price;

      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [listings, query, typeFilter, categoryFilter, cityFilter, sortOrder]);


  const marketplaceSections = useMemo(() => {
    const feed = filteredListings.filter((item) => item.source === "feed_listings" || (item.source === "listings" && FEED_CATEGORIES.includes(item.category)));
    const livestock = filteredListings.filter((item) => item.source === "livestock_listings");
    const agri = filteredListings.filter((item) => item.source === "listings" && AGRI_CATEGORIES.includes(item.category));
    const other = filteredListings.filter((item) => item.source === "listings" && !FEED_CATEGORIES.includes(item.category) && !AGRI_CATEGORIES.includes(item.category));
    return { feed, livestock, agri, other };
  }, [filteredListings]);

  const filteredPurchaseRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return purchaseRequests.filter((item) => {
      const searchable = [item.title, item.animal_type, item.city, item.company_name]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (cityFilter === ALL || item.city === cityFilter);
    });
  }, [purchaseRequests, query, cityFilter]);

  const totalSearchResults =
    marketplaceSections.feed.length +
    marketplaceSections.livestock.length +
    marketplaceSections.agri.length +
    marketplaceSections.other.length +
    filteredPurchaseRequests.length;

  const visibleMarketSections: MarketView[] = marketView === "all" ? ["feed", "livestock", "agri", "slaughterhouse", "other"] : [marketView];

  const featuredListings = useMemo(
    () =>
      listings
        .filter((item) => item.isFeatured)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 6),
    [listings],
  );

  const openSearch = () => {
    setShowSearch(true);
    window.setTimeout(() => document.getElementById("ilan-arama")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const closeSearch = () => {
    setShowSearch(false);
  };

  const executeSearch = () => {
    setVisibleCount(PAGE_SIZE);
    window.setTimeout(() => document.getElementById("ilan-akisi")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const resetFilters = () => {
    setQuery("");
    setTypeFilter(ALL);
    setCategoryFilter(ALL);
    setCityFilter(ALL);
    setSortOrder("recommended");
    setVisibleCount(PAGE_SIZE);
  };

  const openOffer = async (listing: UnifiedListing) => {
    if (isPlatformStaff) {
      alert(
        "Platform personeli ticari teklif gönderemez. İşlem yapmak için ayrı bir şirket hesabı kullanın.",
      );
      return;
    }
    if (!user) {
      router.push("/auth");
      return;
    }

    const buyer = companies.find((company) => company.id === userCompanyId);
    if (!buyer) {
      alert("Teklif göndermek için önce firma profilinizi oluşturmalısınız.");
      router.push("/profil/sirket");
      return;
    }
    if (buyer.status !== "onaylandi") {
      alert(
        "Teklif göndermek için firmanızın yönetici tarafından onaylanması gerekiyor.",
      );
      return;
    }
    if (listing.companyId === buyer.id) {
      alert("Kendi ilanınıza teklif gönderemezsiniz.");
      return;
    }

    const requiredActivities =
      listing.offerKind === "livestock"
        ? ["animal_buyer"]
        : listing.offerKind === "feed"
          ? ["feed_buyer", "animal_buyer"]
          : ["animal_buyer", "feed_buyer"];

    const { data: activityAllowed, error: activityError } = await supabase.rpc(
      "company_has_any_active_activity",
      {
        p_company_id: buyer.id,
        p_activity_codes: requiredActivities,
      },
    );

    if (activityError) {
      alert("Faaliyet yetkiniz kontrol edilemedi: " + activityError.message);
      return;
    }

    if (!activityAllowed) {
      alert(
        listing.offerKind === "livestock"
          ? "Canlı hayvan ilanına teklif vermek için onaylı Canlı Hayvan Alıcısı / Tüccarı faaliyetiniz bulunmalıdır."
          : "Bu ilana teklif vermek için uygun ve onaylı bir alım faaliyetiniz bulunmalıdır.",
      );
      router.push("/profil/faaliyetler");
      return;
    }

    setOfferForm({
      listing,
      quantity: String(listing.quantity),
      price: String(listing.price),
      message: "",
    });
  };

  const submitOffer = async (event: FormEvent) => {
    event.preventDefault();
    if (isPlatformStaff) return;
    if (!offerForm || !userCompanyId) return;

    const quantity = Number(offerForm.quantity);
    const price = Number(offerForm.price);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > offerForm.listing.quantity
    ) {
      alert(
        `Teklif miktarı 0 ile ${offerForm.listing.quantity} arasında olmalıdır.`,
      );
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      alert("Geçerli bir birim fiyat girin.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("trade_offers").insert({
      listing_kind: offerForm.listing.offerKind,
      listing_id: offerForm.listing.id,
      buyer_company_id: userCompanyId,
      offered_quantity: quantity,
      offered_unit_price: price,
      message: offerForm.message.trim() || null,
    });

    if (error) alert("Teklif gönderilemedi: " + error.message);
    else {
      alert("Teklifiniz yönetim incelemesine gönderildi.");
      setOfferForm(null);
    }
    setSubmitting(false);
  };

  const submitGeneralListing = async (event: FormEvent) => {
    event.preventDefault();
    if (isPlatformStaff) {
      alert(
        "Platform personeli ilan oluşturamaz. İlan vermek için ayrı bir şirket hesabı kullanın.",
      );
      return;
    }
    if (!user) return router.push("/auth");

    const company = companies.find((item) => item.id === userCompanyId);
    if (!company || company.status !== "onaylandi") {
      alert("İlan oluşturmak için onaylı bir firma gereklidir.");
      return;
    }

    setSubmitting(true);
    const { data: createdListing, error } = await supabase
      .from("listings")
      .insert({
        company_id: company.id,
        user_id: user.id,
        title: newListing.title.trim(),
        category: newListing.category,
        quantity: Number(newListing.quantity),
        unit: newListing.unit.trim(),
        price: Number(newListing.price),
        city: newListing.city.trim(),
        status: "aktif",
      })
      .select("id")
      .single();

    if (error) alert("İlan oluşturulamadı: " + error.message);
    else {
      try {
        await uploadListingImages(supabase, generalImageFiles, {
          listingType: "listings",
          listingId: createdListing.id,
          companyId: company.id,
          userId: user.id,
        });
      } catch (imageError) {
        await supabase.from("listings").delete().eq("id", createdListing.id);
        alert(
          "Görseller yüklenemediği için ilan kaydedilmedi: " +
            (imageError instanceof Error
              ? imageError.message
              : "Bilinmeyen hata"),
        );
        setSubmitting(false);
        return;
      }
      await dispatchNotificationEmails(supabase);
      setShowGeneralForm(false);
      setNewListing({
        title: "",
        category: "Broyler (Etlik) Yemleri",
        quantity: "",
        unit: "Ton / Çuval",
        price: "",
        city: "Antalya",
      });
      setGeneralImageFiles([]);
      await loadMarketplace(true);
    }
    setSubmitting(false);
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-7xl space-y-7 px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 py-8 text-white shadow-xl md:px-10 md:py-11">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_0.75fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                <BadgeCheck className="h-3.5 w-3.5" /> Doğrulanmış firmalar ·
                Güvenli ticaret
              </span>
              <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-tight md:text-5xl">
                Kanatlı sektörünün birleşik ilan pazarı
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                Yem, hammadde ve canlı hayvan ilanlarını tek ekranda
                karşılaştırın; doğrulanmış firmalara güvenli teklif gönderin.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {isPlatformStaff ? (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-100 px-5 py-3 text-sm font-bold text-violet-950 transition hover:bg-violet-200"
                  >
                    <ShieldCheck className="h-4 w-4" /> Yönetim Merkezine Dön
                  </Link>
                ) : (
                  <Link
                    href={user ? "/ilan/yeni" : "/auth?next=/ilan/yeni"}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    <Plus className="h-4 w-4" /> Yeni İlan Ver
                  </Link>
                )}
                {!user && (
                  <Link
                    href="/auth"
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/40 bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-50"
                  >
                    <LogIn className="h-4 w-4" /> Giriş Yap
                  </Link>
                )}
                <button
                  type="button"
                  onClick={openSearch}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/50 bg-gradient-to-r from-cyan-400 to-emerald-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:-translate-y-0.5 hover:from-cyan-300 hover:to-emerald-300"
                >
                  <Search className="h-4 w-4" /> İlan Ara ve Filtrele
                </button>
                <Link
                  href="/borsa"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold transition hover:bg-white/15"
                >
                  <TrendingUp className="h-4 w-4" /> Canlı Fiyatları Gör
                </Link>
                <Link
                  href="/ekspertiz"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
                >
                  <Microscope className="h-4 w-4" /> Ekspertiz Desteği
                </Link>
                <Link
                  href="/teknik-merkez"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
                >
                  <BookOpenText className="h-4 w-4" /> Teknik Bilgi
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <HeroStat
                label="Aktif ilan"
                value={listings.length}
                icon={Package}
              />
              <HeroStat
                label="Canlı hayvan"
                value={
                  listings.filter(
                    (item) => item.source === "livestock_listings",
                  ).length
                }
                icon={Star}
              />
              <HeroStat
                label="Şehir"
                value={new Set(listings.map((item) => item.city)).size}
                icon={MapPin}
              />
              <HeroStat
                label="Referans fiyat"
                value={marketPrices.length}
                icon={BarChart3}
              />
            </div>
          </div>
        </section>

        {showSearch && (
          <section id="ilan-arama" className="scroll-mt-8 rounded-3xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-4 shadow-xl shadow-cyan-100/60 md:p-6">
            <div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Akıllı pazar araması</p><h2 className="mt-1 text-xl font-black text-slate-900">Aradığınız ilana hızla ulaşın</h2><p className="mt-1 text-sm text-slate-500">Ürün, firma, şehir ve ilan türüne göre sonuçları daraltın.</p></div><button type="button" onClick={closeSearch} aria-label="Aramayı kapat" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" /></button></div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                executeSearch();
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-600" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  placeholder="İlan, ürün, firma, şehir veya hayvan türü ara..."
                  className="w-full rounded-xl border-2 border-cyan-200 bg-white py-3.5 pl-12 pr-4 text-sm font-medium outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-200 transition hover:-translate-y-0.5 hover:from-cyan-500 hover:to-emerald-500"
              >
                <Search className="h-4 w-4" /> Aramayı Uygula
              </button>
            </form>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <FilterSelect
                value={typeFilter}
                onChange={(value) => {
                  setTypeFilter(value);
                  setVisibleCount(PAGE_SIZE);
                }}
                options={TYPE_OPTIONS}
              />
              <FilterSelect
                value={categoryFilter}
                onChange={(value) => {
                  setCategoryFilter(value);
                  setVisibleCount(PAGE_SIZE);
                }}
                options={categories.map((value) => ({
                  value,
                  label: value === ALL ? "Tüm kategoriler" : value,
                }))}
              />
              <FilterSelect
                value={cityFilter}
                onChange={(value) => {
                  setCityFilter(value);
                  setVisibleCount(PAGE_SIZE);
                }}
                options={cities.map((value) => ({
                  value,
                  label: value === ALL ? "Tüm şehirler" : value,
                }))}
              />
              <FilterSelect
                value={sortOrder}
                onChange={setSortOrder}
                options={[
                  { value: "recommended", label: "Önerilen sıralama" },
                  { value: "newest", label: "En yeni ilanlar" },
                  { value: "price_asc", label: "Fiyat: düşükten yükseğe" },
                  { value: "price_desc", label: "Fiyat: yüksekten düşüğe" },
                ]}
              />
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Temizle
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-100 bg-white/80 px-4 py-3 text-xs">
              <span className="font-semibold text-slate-600">
                {query.trim() ? <><strong className="text-cyan-700">“{query.trim()}”</strong> için {totalSearchResults} sonuç bulundu.</> : <>Arama kelimesi yazın veya filtrelerden seçim yapın.</>}
              </span>
              <span className="text-slate-400">Enter tuşu veya “Aramayı Uygula” düğmesiyle sonuçlara geçin.</span>
            </div>
          </section>
  
          )}

        {marketView === "all" && featuredListings.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
                  Özel vitrin
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  Öne çıkan ilanlar
                </h2>
              </div>
              <Sparkles className="h-6 w-6 text-amber-500" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featuredListings.map((item) => (
                <FeaturedCard
                  key={item.key}
                  item={item}
                  onOffer={openOffer}
                  own={Boolean(user && item.companyId === userCompanyId)}
                  staffReadOnly={isPlatformStaff}
                />
              ))}
            </div>
          </section>
        )}

        <section id="ilan-akisi" className="scroll-mt-32 space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Kategori vitrini</p>
              <h2 className="mt-1 text-2xl font-extrabold text-slate-900">{marketView === "all" ? "Pazar bölümleri" : "Seçili pazar bölümü"}</h2>
              <p className="mt-1 text-sm text-slate-500">Her bölümde en yeni 6 ilan gösterilir.</p></div>
            <div className="flex gap-2">
              {marketView !== "all" && <Link href="/#ilan-akisi" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">Tüm bölümler</Link>}
              <button type="button" onClick={() => void loadMarketplace(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Yenile</button>
            </div>
          </div>
          {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}
          {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center text-sm text-slate-400">İlanlar yükleniyor…</div> : (
            <div className="space-y-10">
              {visibleMarketSections.includes("feed") && <MarketplaceSection title="Yem ve hammadde ilanları" description="Fabrika yemi, tahıl, katkı maddesi ve toptan yem ticareti ilanları." count={marketplaceSections.feed.length} href="/?market=feed#ilan-akisi" accent="amber">
                {(marketView === "feed" ? marketplaceSections.feed : marketplaceSections.feed.slice(0, 6)).map((item) => <ListingRow key={item.key} item={item} onOffer={openOffer} own={Boolean(user && item.companyId === userCompanyId)} staffReadOnly={isPlatformStaff} />)}
              </MarketplaceSection>}
              {visibleMarketSections.includes("livestock") && <MarketplaceSection title="Canlı hayvan ilanları" description="Kanatlı, küçükbaş ve büyükbaş satış ilanlarını firma bilgileriyle inceleyin." count={marketplaceSections.livestock.length} href="/livestock" accent="blue">
                {(marketView === "livestock" ? marketplaceSections.livestock : marketplaceSections.livestock.slice(0, 6)).map((item) => <ListingRow key={item.key} item={item} onOffer={openOffer} own={Boolean(user && item.companyId === userCompanyId)} staffReadOnly={isPlatformStaff} />)}
              </MarketplaceSection>}
              {visibleMarketSections.includes("agri") && <MarketplaceSection title="Zirai girdi ve tarım malzemeleri" description="Gübre, tohum, fide, bitki koruma, sulama ve üretim ekipmanı ilanları." count={marketplaceSections.agri.length} href="/?market=agri#ilan-akisi" accent="emerald">
                {(marketView === "agri" ? marketplaceSections.agri : marketplaceSections.agri.slice(0, 6)).map((item) => <ListingRow key={item.key} item={item} onOffer={openOffer} own={Boolean(user && item.companyId === userCompanyId)} staffReadOnly={isPlatformStaff} />)}
              </MarketplaceSection>}
              {visibleMarketSections.includes("slaughterhouse") && <MarketplaceSection title="Kesimhane toplu alım talepleri" description="Onaylı kesimhanelerin canlı hayvan tedariki için yayınladığı toplu alım talepleri." count={filteredPurchaseRequests.length} href="/kesimhane/alim-merkezi" accent="violet">
                {(marketView === "slaughterhouse" ? filteredPurchaseRequests : filteredPurchaseRequests.slice(0, 6)).map((item) => <PurchaseRequestCard key={item.id} item={item} />)}
              </MarketplaceSection>}
              {visibleMarketSections.includes("other") && <MarketplaceSection title="Diğer ticari ilanlar" description="Desteklenen diğer tarımsal ürün ve ticari fırsatlar." count={marketplaceSections.other.length} href="/?market=other#ilan-akisi" accent="slate">
                {(marketView === "other" ? marketplaceSections.other : marketplaceSections.other.slice(0, 6)).map((item) => <ListingRow key={item.key} item={item} onOffer={openOffer} own={Boolean(user && item.companyId === userCompanyId)} staffReadOnly={isPlatformStaff} />)}
              </MarketplaceSection>}
            </div>
          )}
        </section>
        <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Piyasa özeti
                </p>
                <h2 className="mt-1 text-lg font-extrabold text-slate-900">
                  Referans fiyatlar
                </h2>
              </div>
              <Link
                href="/borsa"
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                Tüm fiyatlar →
              </Link>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {marketPrices.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {item.item_name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {item.exchange_source}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-bold text-slate-900">
                    {money(item.price)}
                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                      /{item.unit}
                    </span>
                  </p>
                  <span
                    className={`min-w-14 text-right text-xs font-bold ${item.change_rate >= 0 ? "text-emerald-600" : "text-red-500"}`}
                  >
                    {item.change_rate >= 0 ? "+" : ""}
                    {item.change_rate}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm">
            <TrendingUp className="h-7 w-7 text-emerald-400" />
            <h2 className="mt-4 text-xl font-extrabold">Canlı Borsa</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Piyasa referanslarını, değişim oranlarını ve güncel fiyat
              hareketlerini ayrı ekranda takip edin.
            </p>
            <Link
              href="/borsa"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-emerald-100"
            >
              Piyasa fiyatlarını aç <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>

      {showListingTypeModal && (
        <Modal
          onClose={() => setShowListingTypeModal(false)}
          title="İlan türünü seçin"
        >
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => router.push("/livestock/new")}
              className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-left hover:border-blue-400"
            >
              <p className="font-bold text-blue-900">Canlı Hayvan İlanı</p>
              <p className="mt-1 text-xs text-blue-700">
                Kanatlı, küçükbaş veya büyükbaş ilanı oluşturun.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowListingTypeModal(false);
                setGeneralListingMode("feed");
                setNewListing((current) => ({
                  ...current,
                  category: "Broyler (Etlik) Yemleri",
                  unit: "Ton / Çuval",
                }));
                setShowGeneralForm(true);
              }}
              className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 text-left hover:border-emerald-400"
            >
              <p className="font-bold text-emerald-900">
                Yem, Hammadde veya Genel İlan
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Tarımsal ürün ve girdi ilanı oluşturun.
              </p>
            </button>
          </div>
        </Modal>
      )}

      {showGeneralForm && (
        <Modal
          onClose={() => setShowGeneralForm(false)}
          title={generalListingMode === "agri" ? "Yeni zirai girdi ilanı" : "Yeni yem ve hammadde ilanı"}
        >
          <form
            onSubmit={submitGeneralListing}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <ListingImagePicker
                files={generalImageFiles}
                onChange={setGeneralImageFiles}
              />
            </div>
            <Field label="Firma">
              <select
                value={userCompanyId}
                onChange={(event) => setUserCompanyId(event.target.value)}
                className="input"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kategori">
              <select
                value={newListing.category}
                onChange={(event) =>
                  setNewListing((value) => ({
                    ...value,
                    category: event.target.value,
                  }))
                }
                className="input"
              >
                {generalListingMode === "agri" ? (
                  <>
                    <option>Gübre & Bitki Besleme</option>
                    <option>Tohum & Fide</option>
                    <option>Bitki Koruma Ürünleri</option>
                    <option>Sulama & Tarım Ekipmanları</option>
                    <option>Sera & Üretim Malzemeleri</option>
                  </>
                ) : (
                  <>
                    <option>Broyler (Etlik) Yemleri</option>
                    <option>Yumurta Tavuğu Yemleri</option>
                    <option>Hammadde & Tahıllar</option>
                    <option>Katkı Maddeleri</option>
                  </>
                )}
              </select>
            </Field>
            <Field label="İlan başlığı" wide>
              <input
                value={newListing.title}
                onChange={(event) =>
                  setNewListing((value) => ({
                    ...value,
                    title: event.target.value,
                  }))
                }
                className="input"
                required
              />
            </Field>
            <Field label="Miktar">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newListing.quantity}
                onChange={(event) =>
                  setNewListing((value) => ({
                    ...value,
                    quantity: event.target.value,
                  }))
                }
                className="input"
                required
              />
            </Field>
            <Field label="Birim">
              <input
                value={newListing.unit}
                onChange={(event) =>
                  setNewListing((value) => ({
                    ...value,
                    unit: event.target.value,
                  }))
                }
                className="input"
                required
              />
            </Field>
            <Field label="Birim fiyat (₺)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newListing.price}
                onChange={(event) =>
                  setNewListing((value) => ({
                    ...value,
                    price: event.target.value,
                  }))
                }
                className="input"
                required
              />
            </Field>
            <Field label="Şehir">
              <input
                value={newListing.city}
                onChange={(event) =>
                  setNewListing((value) => ({
                    ...value,
                    city: event.target.value,
                  }))
                }
                className="input"
                required
              />
            </Field>
            <button
              disabled={submitting}
              className="sm:col-span-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Kaydediliyor…" : "İlanı yayınla"}
            </button>
          </form>
        </Modal>
      )}

      {offerForm && (
        <Modal
          onClose={() => !submitting && setOfferForm(null)}
          title="Ticari teklif gönder"
        >
          <div className="mb-4 rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">İlan</p>
            <p className="mt-1 font-bold text-slate-900">
              {offerForm.listing.title}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {offerForm.listing.companyName} · {offerForm.listing.city}
            </p>
          </div>
          <form onSubmit={submitOffer} className="grid gap-4 sm:grid-cols-2">
            <Field label={`Miktar (${offerForm.listing.unit})`}>
              <input
                type="number"
                min="0.01"
                max={offerForm.listing.quantity}
                step="0.01"
                value={offerForm.quantity}
                onChange={(event) =>
                  setOfferForm((value) =>
                    value ? { ...value, quantity: event.target.value } : value,
                  )
                }
                className="input"
                required
              />
            </Field>
            <Field label="Satıcı birim fiyatı (₺)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={offerForm.price}
                onChange={(event) =>
                  setOfferForm((value) =>
                    value ? { ...value, price: event.target.value } : value,
                  )
                }
                className="input"
                required
              />
            </Field>
            <Field label="Mesaj" wide>
              <textarea
                rows={4}
                value={offerForm.message}
                onChange={(event) =>
                  setOfferForm((value) =>
                    value ? { ...value, message: event.target.value } : value,
                  )
                }
                className="input resize-none"
                placeholder="Teslimat ve teklif koşullarınızı yazın."
              />
            </Field>
            <button
              disabled={submitting}
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />{" "}
              {submitting ? "Gönderiliyor…" : "Teklifi gönder"}
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}

function MarketplaceSection({ title, description, count, href, accent, children }: {
  title: string; description: string; count: number; href: string;
  accent: "amber" | "blue" | "emerald" | "violet" | "slate"; children: React.ReactNode;
}) {
  const styles = {
    amber: { panel: "border-amber-300 from-amber-200 via-orange-100 to-amber-50 shadow-amber-200/80", icon: "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-300/50", badge: "bg-amber-950 text-amber-50", link: "bg-amber-500 text-amber-950 hover:bg-amber-400", glow: "bg-amber-300", label: "YEM PAZARI", Icon: Package },
    blue: { panel: "border-blue-300 from-blue-200 via-sky-100 to-blue-50 shadow-blue-200/80", icon: "bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-blue-300/50", badge: "bg-blue-950 text-blue-50", link: "bg-blue-600 text-white hover:bg-blue-500", glow: "bg-blue-300", label: "CANLI HAYVAN", Icon: Star },
    emerald: { panel: "border-emerald-300 from-emerald-200 via-teal-100 to-emerald-50 shadow-emerald-200/80", icon: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-300/50", badge: "bg-emerald-950 text-emerald-50", link: "bg-emerald-600 text-white hover:bg-emerald-500", glow: "bg-emerald-300", label: "ZİRAİ GİRDİ", Icon: Sparkles },
    violet: { panel: "border-violet-300 from-violet-200 via-fuchsia-100 to-violet-50 shadow-violet-200/80", icon: "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-violet-300/50", badge: "bg-violet-950 text-violet-50", link: "bg-violet-700 text-white hover:bg-violet-600", glow: "bg-violet-300", label: "TOPLU ALIM", Icon: Building2 },
    slate: { panel: "border-slate-400 from-slate-300 via-slate-100 to-slate-50 shadow-slate-300/70", icon: "bg-gradient-to-br from-slate-700 to-slate-950 text-white shadow-slate-400/40", badge: "bg-slate-950 text-white", link: "bg-slate-900 text-white hover:bg-slate-700", glow: "bg-slate-400", label: "DİĞER İLANLAR", Icon: BarChart3 },
  } as const;
  const style = styles[accent];
  const Icon = style.Icon;
  return (
    <section className={`relative overflow-hidden rounded-[2rem] border-2 bg-gradient-to-br p-5 shadow-2xl ring-1 ring-white/70 md:p-7 ${style.panel}`}>
      <div className={`pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-20 blur-3xl ${style.glow}`} />
      <div className="relative mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl shadow-lg ${style.icon}`}><Icon className="h-7 w-7" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black tracking-[0.16em] ${style.badge}`}>{style.label}</span>
              <span className="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-xs font-black text-slate-700 shadow-sm">{count} aktif ilan</span>
            </div>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{title}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
        <Link href={href} className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-black shadow-lg transition hover:-translate-y-0.5 ${style.link}`}>
          Tüm ilanları gör <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="relative">
        {count ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{children}</div> : (
          <div className="rounded-2xl border border-white/80 bg-white/70 p-10 text-center shadow-inner backdrop-blur">
            <Package className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">Bu bölümde henüz aktif ilan bulunmuyor.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PurchaseRequestCard({ item }: { item: SlaughterhouseRequest }) {
  return (
    <article className="group relative flex min-h-full flex-col overflow-hidden rounded-3xl border border-violet-200/80 bg-white shadow-[0_16px_40px_-24px_rgba(76,29,149,.55)] transition duration-300 hover:-translate-y-1.5 hover:border-violet-300 hover:shadow-[0_24px_55px_-24px_rgba(76,29,149,.65)]">
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700 p-5 text-white">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black tracking-wider backdrop-blur"><Crown className="h-3 w-3 text-amber-300" /> ONAYLI TOPLU ALIM</span>
          <span className="text-[11px] font-semibold text-violet-100">{new Date(item.created_at).toLocaleDateString("tr-TR")}</span>
        </div>
        <h4 className="relative mt-5 line-clamp-2 min-h-14 text-xl font-black leading-7">{item.title}</h4>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="space-y-2 text-xs font-medium text-slate-600">
          <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Building2 className="h-3.5 w-3.5" /></span>{item.company_name}</span>
          <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><MapPin className="h-3.5 w-3.5" /></span>{item.city}</span>
          <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><CalendarDays className="h-3.5 w-3.5" /></span>{new Date(item.delivery_start).toLocaleDateString("tr-TR")} – {new Date(item.delivery_end).toLocaleDateString("tr-TR")}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Talep miktarı</p><p className="mt-1 text-base font-black text-slate-900">{item.quantity_required.toLocaleString("tr-TR")} baş</p></div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">Hedef fiyat</p><p className="mt-1 truncate text-base font-black text-violet-800">{item.target_price == null ? "Teklif usulü" : money(item.target_price)}</p></div>
        </div>
        <Link href={`/kesimhane/alim-merkezi/${item.id}`} className="mt-auto pt-5"><span className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-700 px-4 py-3 text-xs font-black text-white shadow-lg shadow-violet-200 transition group-hover:from-violet-600 group-hover:to-fuchsia-600">Talebi incele <ChevronRight className="h-4 w-4" /></span></Link>
      </div>
    </article>
  );
}
function HeroStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Package;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-300">{label}</p>
        <Icon className="h-4 w-4 text-emerald-300" />
      </div>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-400"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function PromotionBadges({ item }: { item: UnifiedListing }) {
  return (
    <>
      {item.isFeatured && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold text-amber-800">
          <Crown className="h-3 w-3" /> VİTRİN
        </span>
      )}
      {item.isUrgent && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-extrabold text-red-700">
          <AlertTriangle className="h-3 w-3" /> ACİL
        </span>
      )}
    </>
  );
}

function FeaturedCard({
  item,
  onOffer,
  own,
  staffReadOnly,
}: {
  item: UnifiedListing;
  onOffer: (item: UnifiedListing) => void;
  own: boolean;
  staffReadOnly: boolean;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5 shadow-md">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-amber-200/30" />
      <div className="relative">
        <div className="mb-4 overflow-hidden rounded-xl bg-slate-100">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              className="aspect-[16/9] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-slate-100 to-emerald-50">
              <Package className="h-9 w-9 text-slate-300" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <PromotionBadges item={item} />
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${typeStyles[item.source]}`}
          >
            {item.typeLabel}
          </span>
        </div>
        <h3 className="mt-4 line-clamp-2 text-lg font-extrabold text-slate-900">
          {item.title}
        </h3>
        <p className="mt-2 text-xs text-slate-500">
          {item.companyName} · {item.city}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Metric
            label="Miktar"
            value={`${item.quantity.toLocaleString("tr-TR")} ${item.unit}`}
          />
          <Metric label="Birim fiyat" value={money(item.price)} accent />
        </div>
        <CardActions item={item} onOffer={onOffer} own={own} staffReadOnly={staffReadOnly} />
      </div>
    </article>
  );
}

function ListingRow({
  item,
  onOffer,
  own,
  staffReadOnly,
}: {
  item: UnifiedListing;
  onOffer: (item: UnifiedListing) => void;
  own: boolean;
  staffReadOnly: boolean;
}) {
  return (
    <article
      className={`group relative flex min-h-full flex-col overflow-hidden rounded-3xl border bg-white shadow-[0_16px_40px_-28px_rgba(15,23,42,.5)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_55px_-28px_rgba(15,23,42,.65)] ${item.isHighlighted ? "border-amber-300 ring-2 ring-amber-200" : "border-white/80"}`}
    >
      <div className="relative overflow-hidden bg-slate-100">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-slate-100 via-white to-emerald-100">
            <Package className="h-10 w-10 text-slate-300" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm ring-1 ${typeStyles[item.source]}`}
          >
            {item.typeLabel}
          </span>
          <PromotionBadges item={item} />
        </div>
        <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
          {new Date(item.createdAt).toLocaleDateString("tr-TR")}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold text-emerald-700">{item.category}</p>
          <BadgeCheck
            className="h-4 w-4 flex-none text-blue-600"
            aria-label="Doğrulanmış firma"
          />
        </div>

        <Link
          href={item.detailHref || "#"}
          className="mt-2 line-clamp-2 min-h-12 text-base font-extrabold leading-6 text-slate-900 transition group-hover:text-emerald-700"
        >
          {item.title}
        </Link>

        <div className="mt-3 space-y-1.5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5 truncate">
            <Building2 className="h-3.5 w-3.5 flex-none" />
            {item.companyName}
          </span>
          <span className="flex items-center gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 flex-none" />
            {[item.city, item.district].filter(Boolean).join(" / ")}
          </span>
          {item.extraLabel && (
            <span className="block truncate">{item.extraLabel}</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric
            label="Miktar"
            value={`${item.quantity.toLocaleString("tr-TR")} ${item.unit}`}
          />
          <Metric label="Birim fiyat" value={money(item.price)} accent />
        </div>

        <div className="mt-auto pt-4">
          <CardActions item={item} onOffer={onOffer} own={own} staffReadOnly={staffReadOnly} />
        </div>
      </div>
    </article>
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
      className={`rounded-xl border px-3 py-2.5 ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
    >
      <p
        className={`text-[10px] font-semibold uppercase tracking-wide ${accent ? "text-emerald-600" : "text-slate-400"}`}
      >
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-extrabold ${accent ? "text-emerald-700" : "text-slate-800"}`}
      >
        {value}
      </p>
    </div>
  );
}

function CardActions({
  item,
  onOffer,
  own,
  staffReadOnly,
  compact = false,
}: {
  item: UnifiedListing;
  onOffer: (item: UnifiedListing) => void;
  own: boolean;
  staffReadOnly: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "flex lg:flex-col" : "mt-4 flex"} gap-2`}>
      {item.detailHref && (
        <Link
          href={item.detailHref}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:border-emerald-300"
        >
          Detay
        </Link>
      )}
      {staffReadOnly ? (
        <span className="inline-flex flex-1 items-center justify-center rounded-xl bg-violet-50 px-3 py-2.5 text-center text-xs font-bold text-violet-700">
          Yönetici görüntüleme modu
        </span>
      ) : own ? (
        <span className="inline-flex flex-1 items-center justify-center rounded-xl bg-blue-50 px-3 py-2.5 text-center text-xs font-bold text-blue-700">
          Kendi ilanınız
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onOffer(item)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
        >
          <Send className="h-3.5 w-3.5" /> Teklif Ver
        </button>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-bold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-10 text-center text-sm text-slate-400">
          Pazar yükleniyor…
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}