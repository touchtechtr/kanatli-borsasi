"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  HeartPulse,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type FormData = {
  title: string;
  animal_type: string;
  category: string;
  breed: string;
  quantity: string;
  unit: string;
  price: string;
  min_order_quantity: string;
  city: string;
  district: string;
  age_group: string;
  average_weight: string;
  gender: string;
  health_status: string;
  vaccination_status: string;
  health_certificate: boolean;
  negotiable: boolean;
  delivery_available: boolean;
  delivery_terms: string;
  description: string;
  declaration: boolean;
};

const INITIAL_FORM: FormData = {
  title: "",
  animal_type: "Kanatlı Hayvan",
  category: "Broyler (Etlik)",
  breed: "",
  quantity: "",
  unit: "Baş",
  price: "",
  min_order_quantity: "1",
  city: "Antalya",
  district: "",
  age_group: "",
  average_weight: "",
  gender: "Karisik",
  health_status: "Sağlık Sertifikalı / Aşıları Tam",
  vaccination_status: "Aşıları tam",
  health_certificate: true,
  negotiable: false,
  delivery_available: false,
  delivery_terms: "",
  description: "",
  declaration: false,
};

const CATEGORY_OPTIONS: Record<string, string[]> = {
  "Kanatlı Hayvan": [
    "Broyler (Etlik)",
    "Yumurtalık Yarka",
    "Damızlık",
    "Hindi",
    "Kaz / Ördek",
    "Civciv",
  ],
  "Küçükbaş (Koyun/Keçi)": [
    "Koyun",
    "Keçi",
    "Kuzu",
    "Oğlak",
    "Damızlık Küçükbaş",
  ],
  "Büyükbaş (İnek/Sığır)": [
    "Besi Sığırı",
    "Süt Sığırı",
    "Dana",
    "Düve",
    "Damızlık Büyükbaş",
  ],
};

const getRequiredActivity = (animalType: string, category: string) => {
  if (animalType === "Kanatlı Hayvan") {
    if (category === "Civciv") {
      return { code: "chick_producer", label: "Civciv / Piliç Üreticisi" };
    }

    if (category === "Damızlık") {
      return { code: "poultry_breeder", label: "Kanatlı Yetiştiricisi" };
    }
  }

  return { code: "animal_seller", label: "Canlı Hayvan Satıcısı" };
};

export default function NewLivestockPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activityRequired, setActivityRequired] = useState(false);

  const quantity = Number(form.quantity);
  const price = Number(form.price);
  const estimatedTotal =
    Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0;
  const requiredActivity = getRequiredActivity(form.animal_type, form.category);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleAnimalTypeChange = (animalType: string) => {
    setForm((current) => ({
      ...current,
      animal_type: animalType,
      category: CATEGORY_OPTIONS[animalType]?.[0] ?? "",
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setActivityRequired(false);

    const parsedQuantity = Number(form.quantity);
    const parsedPrice = Number(form.price);
    const parsedMinimum = Number(form.min_order_quantity);
    const parsedWeight = form.average_weight
      ? Number(form.average_weight)
      : null;

    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setErrorMessage("Adet bilgisi sıfırdan büyük bir tam sayı olmalıdır.");
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage("Birim fiyat sıfırdan büyük olmalıdır.");
      return;
    }

    if (
      !Number.isInteger(parsedMinimum) ||
      parsedMinimum <= 0 ||
      parsedMinimum > parsedQuantity
    ) {
      setErrorMessage(
        "Minimum sipariş miktarı sıfırdan büyük olmalı ve toplam adedi aşmamalıdır.",
      );
      return;
    }

    if (!form.declaration) {
      setErrorMessage("İlan bilgilerinin doğruluğunu onaylamalısınız.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      router.push("/auth");
      return;
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (companyError || !company) {
      setLoading(false);
      alert(
        "İlan vermeden önce firma veya çiftlik profilinizi oluşturmalısınız.",
      );
      router.push("/profil/sirket");
      return;
    }

    if (company.status !== "onaylandi") {
      setLoading(false);
      alert(
        company.status === "reddedildi"
          ? "Firma başvurunuz reddedildiği için ilan yayınlayamazsınız."
          : "İlan verebilmek için firmanızın yönetici tarafından onaylanması gerekir.",
      );
      router.push("/profil/sirket");
      return;
    }

    const { error } = await supabase.from("livestock_listings").insert({
      user_id: user.id,
      company_id: company.id,
      title: form.title.trim(),
      animal_type: form.animal_type,
      category: form.category,
      breed: form.breed.trim() || null,
      quantity: parsedQuantity,
      unit: form.unit,
      price: parsedPrice,
      min_order_quantity: parsedMinimum,
      city: form.city.trim(),
      district: form.district.trim() || null,
      age_group: form.age_group.trim() || null,
      average_weight: parsedWeight,
      gender: form.gender,
      health_status: form.health_status.trim() || null,
      vaccination_status: form.vaccination_status.trim() || null,
      health_certificate: form.health_certificate,
      negotiable: form.negotiable,
      delivery_available: form.delivery_available,
      delivery_terms: form.delivery_available
        ? form.delivery_terms.trim() || null
        : null,
      description: form.description.trim() || null,
      status: "aktif",
    });

    if (error) {
      setErrorMessage("İlan eklenirken hata oluştu: " + error.message);
      setActivityRequired(
        error.message.includes("gerekli onaylı faaliyet yetkiniz bulunmuyor"),
      );
      setLoading(false);
      return;
    }

    alert(
      "İlanınız kaydedildi. Moderasyon sonucuna göre yayınlanacak veya yönetici incelemesine alınacaktır.",
    );
    router.push("/livestock");
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href="/livestock"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Canlı hayvan ilanlarına dön
        </Link>

        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-7 text-white shadow-lg md:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Doğrulanmış firma ilanı
          </span>
          <h1 className="mt-4 text-3xl font-extrabold">
            Yeni Canlı Hayvan İlanı
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Alıcıların doğru karar verebilmesi için hayvan, sağlık, fiyat ve
            teslimat bilgilerini eksiksiz girin.
          </p>
        </header>

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{errorMessage}</p>
            {activityRequired && (
              <div className="mt-4 flex flex-col gap-2 border-t border-red-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-red-700">
                  Bu ilan için firmanızın onaylı{" "}
                  <strong>{requiredActivity.label}</strong> faaliyeti
                  bulunmalıdır.
                </p>
                <Link
                  href={`/profil/faaliyetler?activity=${encodeURIComponent(
                    requiredActivity.code,
                  )}`}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-800"
                >
                  Bu faaliyet için başvur
                </Link>
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
        >
          <div className="space-y-6">
            <FormSection
              title="Temel ilan bilgileri"
              description="İlanın pazarda doğru kategoride ve doğru konumda görünmesini sağlar."
            >
              <Field label="İlan başlığı" className="sm:col-span-2">
                <input
                  required
                  minLength={10}
                  maxLength={120}
                  value={form.title}
                  onChange={(event) => setField("title", event.target.value)}
                  placeholder="Örn: Antalya 30 Günlük Ross 308 Broyler Sürüsü"
                  className={inputClass}
                />
              </Field>

              <Field label="Canlı grubu">
                <select
                  value={form.animal_type}
                  onChange={(event) =>
                    handleAnimalTypeChange(event.target.value)
                  }
                  className={inputClass}
                >
                  {Object.keys(CATEGORY_OPTIONS).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Kategori">
                <select
                  value={form.category}
                  onChange={(event) => setField("category", event.target.value)}
                  className={inputClass}
                >
                  {(CATEGORY_OPTIONS[form.animal_type] ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Irk / çeşit">
                <input
                  value={form.breed}
                  onChange={(event) => setField("breed", event.target.value)}
                  placeholder="Örn: Ross 308, Cobb 500"
                  className={inputClass}
                />
              </Field>

              <Field label="Şehir">
                <input
                  required
                  value={form.city}
                  onChange={(event) => setField("city", event.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="İlçe">
                <input
                  value={form.district}
                  onChange={(event) => setField("district", event.target.value)}
                  placeholder="Örn: Döşemealtı"
                  className={inputClass}
                />
              </Field>

              <Field label="Ayrıntılı açıklama" className="sm:col-span-2">
                <textarea
                  rows={5}
                  maxLength={1500}
                  value={form.description}
                  onChange={(event) =>
                    setField("description", event.target.value)
                  }
                  placeholder="Sürünün yetiştirilme koşulları, teslim zamanı ve alıcının bilmesi gereken diğer ayrıntılar..."
                  className={`${inputClass} resize-y`}
                />
                <p className="mt-1 text-right text-[11px] text-slate-400">
                  {form.description.length}/1500
                </p>
              </Field>
            </FormSection>

            <FormSection
              title="Hayvan ve sağlık bilgileri"
              description="Eksiksiz sağlık bilgileri ilan güvenini artırır."
              icon={<HeartPulse className="h-5 w-5" />}
            >
              <Field label="Yaş / dönem">
                <input
                  value={form.age_group}
                  onChange={(event) =>
                    setField("age_group", event.target.value)
                  }
                  placeholder="Örn: 30 günlük"
                  className={inputClass}
                />
              </Field>

              <Field label="Ortalama ağırlık (kg)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.average_weight}
                  onChange={(event) =>
                    setField("average_weight", event.target.value)
                  }
                  placeholder="Örn: 1.80"
                  className={inputClass}
                />
              </Field>

              <Field label="Cinsiyet">
                <select
                  value={form.gender}
                  onChange={(event) => setField("gender", event.target.value)}
                  className={inputClass}
                >
                  <option value="Karisik">Karışık</option>
                  <option value="Disi">Dişi</option>
                  <option value="Erkek">Erkek</option>
                  <option value="Belirtilmedi">Belirtilmedi</option>
                </select>
              </Field>

              <Field label="Sağlık durumu">
                <input
                  value={form.health_status}
                  onChange={(event) =>
                    setField("health_status", event.target.value)
                  }
                  className={inputClass}
                />
              </Field>

              <Field label="Aşı durumu" className="sm:col-span-2">
                <input
                  value={form.vaccination_status}
                  onChange={(event) =>
                    setField("vaccination_status", event.target.value)
                  }
                  placeholder="Uygulanan aşılar veya aşı takvimi"
                  className={inputClass}
                />
              </Field>

              <CheckCard
                checked={form.health_certificate}
                onChange={(checked) => setField("health_certificate", checked)}
                title="Sağlık sertifikası mevcut"
                description="Belge talep halinde alıcıya sunulabilir."
              />
            </FormSection>

            <FormSection
              title="Fiyat, miktar ve teslimat"
              description="Teklif ve komisyon hesabı bu bilgiler üzerinden yapılır."
              icon={<Truck className="h-5 w-5" />}
            >
              <Field label="Toplam adet">
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(event) => setField("quantity", event.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Birim">
                <select
                  value={form.unit}
                  onChange={(event) => setField("unit", event.target.value)}
                  className={inputClass}
                >
                  <option value="Baş">Baş</option>
                  <option value="Adet">Adet</option>
                  <option value="Sürü">Sürü</option>
                </select>
              </Field>

              <Field label="Birim fiyat (TL)">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setField("price", event.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Minimum sipariş miktarı">
                <input
                  required
                  type="number"
                  min="1"
                  max={form.quantity || undefined}
                  step="1"
                  value={form.min_order_quantity}
                  onChange={(event) =>
                    setField("min_order_quantity", event.target.value)
                  }
                  className={inputClass}
                />
              </Field>

              <CheckCard
                checked={form.negotiable}
                onChange={(checked) => setField("negotiable", checked)}
                title="Fiyat pazarlığa açık"
                description="Alıcılar farklı birim fiyatla teklif gönderebilir."
              />

              <CheckCard
                checked={form.delivery_available}
                onChange={(checked) => setField("delivery_available", checked)}
                title="Teslimat imkânı var"
                description="Nakliye veya teslim desteği sunulabilir."
              />

              {form.delivery_available && (
                <Field label="Teslimat koşulları" className="sm:col-span-2">
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={form.delivery_terms}
                    onChange={(event) =>
                      setField("delivery_terms", event.target.value)
                    }
                    placeholder="Teslimat bölgesi, nakliye ücreti veya araç koşulları..."
                    className={`${inputClass} resize-y`}
                  />
                </Field>
              )}
            </FormSection>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <input
                type="checkbox"
                checked={form.declaration}
                onChange={(event) =>
                  setField("declaration", event.target.checked)
                }
                className="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-600"
              />
              <span className="text-sm leading-6 text-emerald-900">
                Girdiğim bilgilerin doğru olduğunu ve hayvanların sağlık
                belgelerini talep halinde sunabileceğimi kabul ediyorum.
              </span>
            </label>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-emerald-600" />
                <h2 className="font-bold text-slate-900">İlan özeti</h2>
              </div>

              <div className="mt-5 space-y-3">
                <SummaryRow
                  label="Başlık"
                  value={form.title || "Henüz girilmedi"}
                />
                <SummaryRow label="Kategori" value={form.category} />
                <SummaryRow
                  label="Konum"
                  value={[form.city, form.district].filter(Boolean).join(" / ")}
                />
                <SummaryRow
                  label="Miktar"
                  value={`${form.quantity || "0"} ${form.unit}`}
                />
                <SummaryRow
                  label="Birim fiyat"
                  value={price > 0 ? currency(price) : "₺0,00"}
                />
                <SummaryRow
                  label="Tahmini toplam"
                  value={
                    estimatedTotal > 0 ? currency(estimatedTotal) : "₺0,00"
                  }
                  strong
                />
                <SummaryRow
                  label="Sertifika"
                  value={form.health_certificate ? "Mevcut" : "Belirtilmedi"}
                />
                <SummaryRow
                  label="Teslimat"
                  value={form.delivery_available ? "Sunuluyor" : "Alıcıya ait"}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              İlanınız platform kurallarına göre otomatik değerlendirilir.
              Riskli görülen kayıtlar yönetici incelemesine alınabilir.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {loading ? "İlan kaydediliyor..." : "İlanı yayınla"}
            </button>
          </aside>
        </form>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100";

const currency = (value: number) =>
  Number(value).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });

function FormSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
            {icon}
          </div>
        )}
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function CheckCard({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-800">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function SummaryRow({
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
      className={`flex items-start justify-between gap-4 ${strong ? "border-t border-slate-200 pt-3" : ""}`}
    >
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`max-w-[190px] text-right text-xs ${strong ? "font-bold text-emerald-700" : "font-semibold text-slate-800"}`}
      >
        {value}
      </span>
    </div>
  );
}
