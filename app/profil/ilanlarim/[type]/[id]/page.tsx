"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Eye,
  ImagePlus,
  PauseCircle,
  RefreshCw,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import ListingImagePicker from "@/components/listings/ListingImagePicker";
import { createClient } from "@/lib/supabase/client";
import {
  uploadListingImages,
  type ListingImageType,
} from "@/lib/listing-images";

const ALLOWED_TYPES: ListingImageType[] = [
  "listings",
  "feed_listings",
  "livestock_listings",
];

type ListingImage = {
  id: string;
  public_url: string;
  storage_path: string;
  position: number;
  is_primary: boolean;
};

type ListingForm = {
  title: string;
  category: string;
  quantity: string;
  unit: string;
  price: string;
  city: string;
  description: string;
};

const EMPTY_FORM: ListingForm = {
  title: "",
  category: "",
  quantity: "",
  unit: "",
  price: "",
  city: "",
  description: "",
};

const TYPE_LABELS: Record<ListingImageType, string> = {
  listings: "Genel ilan",
  feed_listings: "Yem ilanı",
  livestock_listings: "Canlı hayvan ilanı",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const actionClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

export default function ManageListingPage() {
  const params = useParams<Record<string, string | string[]>>();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const pathParts = pathname.split("/").filter(Boolean);
  const rawType = params?.type ?? pathParts.at(-2);
  const rawId = params?.id ?? pathParts.at(-1);
  const listingType = (
    Array.isArray(rawType) ? rawType[0] : rawType
  ) as ListingImageType;
  const listingId = Array.isArray(rawId) ? rawId[0] : rawId;
  const validRoute = ALLOWED_TYPES.includes(listingType) && Boolean(listingId);

  const [form, setForm] = useState<ListingForm>(EMPTY_FORM);
  const [companyId, setCompanyId] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const [moderationStatus, setModerationStatus] = useState("");
  const [images, setImages] = useState<ListingImage[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    if (!validRoute) {
      setErrorMessage("Geçersiz ilan bağlantısı.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/auth");
      return;
    }

    const { data: allowed, error: accessError } = await supabase.rpc(
      "can_manage_listing",
      {
        p_listing_type: listingType,
        p_listing_id: listingId,
      },
    );
    if (accessError || !allowed) {
      setErrorMessage(
        accessError?.message || "Bu ilanı yönetme yetkiniz bulunmuyor.",
      );
      setLoading(false);
      return;
    }

    const [
      { data: listing, error: listingError },
      { data: imageRows, error: imageError },
    ] = await Promise.all([
      supabase.from(listingType).select("*").eq("id", listingId).maybeSingle(),
      supabase
        .from("listing_images")
        .select("id, public_url, storage_path, position, is_primary")
        .eq("listing_type", listingType)
        .eq("listing_id", listingId)
        .order("position"),
    ]);

    if (listingError || !listing) {
      setErrorMessage(listingError?.message || "İlan bulunamadı.");
      setLoading(false);
      return;
    }
    if (imageError)
      setErrorMessage("Görseller yüklenemedi: " + imageError.message);

    setUserId(user.id);
    setCompanyId(String(listing.company_id || ""));
    setStatus(String(listing.status || ""));
    setModerationStatus(String(listing.moderation_status || ""));
    setForm({
      title: String(listing.title || ""),
      category: String(listing.category || ""),
      quantity: String(listing.quantity || ""),
      unit: String(listing.unit || ""),
      price: String(listing.price || ""),
      city: String(listing.city || ""),
      description: String(listing.description || ""),
    });
    setImages((imageRows ?? []) as ListingImage[]);
    setLoading(false);
  }, [listingId, listingType, router, supabase, validRoute]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const saveListing = async (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(form.quantity);
    const price = Number(form.price);
    if (!form.title.trim() || !form.category.trim() || !form.city.trim())
      return setErrorMessage("Başlık, kategori ve şehir zorunludur.");
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price) ||
      price <= 0
    )
      return setErrorMessage("Miktar ve fiyat sıfırdan büyük olmalıdır.");

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);
    const updates: Record<string, unknown> = {
      title: form.title.trim(),
      category: form.category.trim(),
      quantity,
      unit: form.unit.trim(),
      price,
      city: form.city.trim(),
    };
    if (listingType !== "feed_listings")
      updates.description = form.description.trim() || null;

    const { error } = await supabase
      .from(listingType)
      .update(updates)
      .eq("id", listingId);
    if (error) {
      setErrorMessage("İlan kaydedilemedi: " + error.message);
      setSaving(false);
      return;
    }

    if (newFiles.length) {
      try {
        await uploadListingImages(supabase, newFiles, {
          listingType,
          listingId,
          companyId,
          userId,
          startPosition: images.length,
          makeFirstPrimary: images.length === 0,
        });
        setNewFiles([]);
      } catch (error) {
        setErrorMessage(
          "İlan kaydedildi ancak görseller yüklenemedi: " +
            (error instanceof Error ? error.message : "Bilinmeyen hata"),
        );
        setSaving(false);
        await loadPage();
        return;
      }
    }

    setMessage(
      "İlan güncellendi. Önemli bilgiler değiştiyse ilan yeniden yönetici incelemesine alınmıştır.",
    );
    setSaving(false);
    await loadPage();
  };

  const changeStatus = async (nextStatus: "aktif" | "pasif" | "satildi") => {
    if (
      nextStatus === "satildi" &&
      !confirm("İlanı satıldı olarak kapatmak istediğinize emin misiniz?")
    )
      return;
    setSaving(true);
    setErrorMessage(null);
    const { error } = await supabase.rpc("set_own_listing_status", {
      p_listing_type: listingType,
      p_listing_id: listingId,
      p_status: nextStatus,
    });
    if (error) setErrorMessage(error.message);
    else
      setMessage(
        nextStatus === "aktif"
          ? "İlan yeniden yayınlandı."
          : nextStatus === "pasif"
            ? "İlan geçici olarak duraklatıldı."
            : "İlan satıldı olarak kapatıldı.",
      );
    setSaving(false);
    await loadPage();
  };

  const deleteImage = async (image: ListingImage) => {
    if (!confirm("Bu görseli kalıcı olarak silmek istiyor musunuz?")) return;
    setSaving(true);
    const storageResult = await supabase.storage
      .from("listing-images")
      .remove([image.storage_path]);
    if (storageResult.error) {
      setErrorMessage(storageResult.error.message);
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("listing_images")
      .delete()
      .eq("id", image.id);
    if (error) setErrorMessage(error.message);
    else {
      const remaining = images.filter((item) => item.id !== image.id);
      if (image.is_primary && remaining[0])
        await makePrimary(remaining[0], false);
      setMessage("Görsel silindi.");
    }
    setSaving(false);
    await loadPage();
  };

  const makePrimary = async (image: ListingImage, reload = true) => {
    setSaving(true);
    await supabase
      .from("listing_images")
      .update({ is_primary: false })
      .eq("listing_type", listingType)
      .eq("listing_id", listingId)
      .eq("is_primary", true);
    const { error } = await supabase
      .from("listing_images")
      .update({ is_primary: true })
      .eq("id", image.id);
    if (error) setErrorMessage(error.message);
    else setMessage("Kapak görseli güncellendi.");
    setSaving(false);
    if (reload) await loadPage();
  };

  const moveImage = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    setSaving(true);
    const current = images[index];
    const other = images[target];
    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      supabase
        .from("listing_images")
        .update({ position: other.position })
        .eq("id", current.id),
      supabase
        .from("listing_images")
        .update({ position: current.position })
        .eq("id", other.id),
    ]);
    if (firstError || secondError)
      setErrorMessage(
        firstError?.message ||
          secondError?.message ||
          "Sıralama değiştirilemedi.",
      );
    setSaving(false);
    await loadPage();
  };

  if (loading)
    return (
      <div className="min-h-screen bg-slate-50 p-12 text-center text-sm text-slate-500">
        İlan yönetimi yükleniyor…
      </div>
    );

  if (!validRoute) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-extrabold text-slate-900">
            İlan bağlantısı geçersiz
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            İlan türü veya ilan numarası bağlantıda bulunamadı.
          </p>
          <Link
            href="/profil/ilanlarim"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"
          >
            <ArrowLeft className="h-4 w-4" /> İlanlarıma dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              href="/profil/ilanlarim"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> İlanlarıma dön
            </Link>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
              {validRoute ? TYPE_LABELS[listingType] : "İlan"}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold text-slate-900">
              İlanı yönet
            </h1>
          </div>
          <button
            onClick={() => void loadPage()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
          >
            <RefreshCw className="h-4 w-4" /> Yenile
          </button>
        </header>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}
        {message && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            {message}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <Info label="Yayın durumu" value={status} />
          <Info label="Moderasyon" value={moderationStatus || "—"} />
          <Info
            label="Görsel"
            value={`${images.length + newFiles.length} / 8`}
          />
        </section>

        <form
          onSubmit={saveListing}
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-extrabold text-slate-900">
                Temel bilgiler
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Başlık, kategori, miktar veya fiyat değişikliği güvenlik
                amacıyla yeniden incelemeye düşebilir.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="İlan başlığı" wide>
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Kategori">
                  <input
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Şehir">
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Miktar">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Birim">
                  <input
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Birim fiyat (₺)">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
                    className={inputClass}
                    required
                  />
                </Field>
                {listingType !== "feed_listings" && (
                  <Field label="Açıklama" wide>
                    <textarea
                      rows={5}
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      className={`${inputClass} resize-y`}
                    />
                  </Field>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-extrabold text-slate-900">
                Mevcut görseller
              </h2>
              {images.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  <ImagePlus className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                  Henüz görsel eklenmemiş.
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {images.map((image, index) => (
                    <div
                      key={image.id}
                      className={`overflow-hidden rounded-xl border-2 ${image.is_primary ? "border-emerald-500" : "border-slate-200"}`}
                    >
                      <img
                        src={image.public_url}
                        alt="İlan görseli"
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <div className="flex items-center justify-between gap-1 bg-slate-900 p-2 text-white">
                        {image.is_primary ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold">
                            <Star className="h-3 w-3 fill-current" />
                            Kapak
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void makePrimary(image)}
                            className="text-[10px] font-bold"
                          >
                            Kapak yap
                          </button>
                        )}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={index === 0 || saving}
                            onClick={() => void moveImage(index, -1)}
                            aria-label="Sola taşı"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={index === images.length - 1 || saving}
                            onClick={() => void moveImage(index, 1)}
                            aria-label="Sağa taşı"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void deleteImage(image)}
                            aria-label="Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-300" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6">
                <ListingImagePicker
                  files={newFiles}
                  onChange={setNewFiles}
                  maxFiles={Math.max(0, 8 - images.length)}
                />
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="sticky top-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-extrabold text-slate-900">Yayın işlemleri</h2>
              <button
                type="submit"
                disabled={saving}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
              </button>
              <div className="mt-3 grid gap-2">
                {status === "aktif" ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void changeStatus("pasif")}
                    className={actionClass}
                  >
                    <PauseCircle className="h-4 w-4" />
                    Geçici olarak duraklat
                  </button>
                ) : (
                  status !== "satildi" &&
                  moderationStatus !== "reddedildi" && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void changeStatus("aktif")}
                      className={actionClass}
                    >
                      <Eye className="h-4 w-4" />
                      Yeniden yayınla
                    </button>
                  )
                )}
                {status !== "satildi" && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void changeStatus("satildi")}
                    className={`${actionClass} border-amber-200 text-amber-800`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Satıldı olarak kapat
                  </button>
                )}
              </div>
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                Reddedilen ilan doğrudan yayınlanamaz. Önce istenen düzeltmeleri
                kaydedin; sistem ilanı yeniden incelemeye gönderir.
              </p>
            </section>
          </aside>
        </form>
      </div>
    </main>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-extrabold capitalize text-slate-900">{value}</p>
    </div>
  );
}
