"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PlatformUI";

type Settings = {
  manual_review_all: boolean;
  duplicate_review_enabled: boolean;
  duplicate_window_hours: number;
  new_company_review_enabled: boolean;
  new_company_days: number;
  maximum_unit_price: number | null;
  maximum_quantity: number | null;
  blocked_words: string[];
  updated_at: string;
};

const DEFAULTS: Settings = {
  manual_review_all: false,
  duplicate_review_enabled: true,
  duplicate_window_hours: 24,
  new_company_review_enabled: false,
  new_company_days: 7,
  maximum_unit_price: null,
  maximum_quantity: null,
  blocked_words: [],
  updated_at: "",
};

export default function ListingRulesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [blockedWordsText, setBlockedWordsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("listing_moderation_settings")
      .select(
        "manual_review_all, duplicate_review_enabled, duplicate_window_hours, new_company_review_enabled, new_company_days, maximum_unit_price, maximum_quantity, blocked_words, updated_at",
      )
      .eq("id", true)
      .maybeSingle();

    if (loadError || !data) {
      setError(loadError?.message ?? "Moderasyon ayarları bulunamadı.");
    } else {
      const loaded = data as Settings;
      setSettings(loaded);
      setBlockedWordsText((loaded.blocked_words ?? []).join("\n"));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    setError(null);
    setSuccess(null);

    if (
      settings.duplicate_window_hours < 1 ||
      settings.duplicate_window_hours > 720
    ) {
      setError("Mükerrer ilan süresi 1 ile 720 saat arasında olmalıdır.");
      return;
    }
    if (settings.new_company_days < 1 || settings.new_company_days > 365) {
      setError("Yeni firma süresi 1 ile 365 gün arasında olmalıdır.");
      return;
    }

    const blockedWords = [
      ...new Set(
        blockedWordsText
          .split(/[\n,]+/)
          .map((word) => word.trim().toLocaleLowerCase("tr-TR"))
          .filter(Boolean),
      ),
    ];

    setSaving(true);
    const { error: saveError } = await supabase.rpc(
      "admin_update_listing_moderation_settings",
      {
        p_manual_review_all: settings.manual_review_all,
        p_duplicate_review_enabled: settings.duplicate_review_enabled,
        p_duplicate_window_hours: settings.duplicate_window_hours,
        p_new_company_review_enabled: settings.new_company_review_enabled,
        p_new_company_days: settings.new_company_days,
        p_maximum_unit_price: settings.maximum_unit_price,
        p_maximum_quantity: settings.maximum_quantity,
        p_blocked_words: blockedWords,
      },
    );

    if (saveError) setError(`Ayarlar kaydedilemedi: ${saveError.message}`);
    else {
      setSuccess("Moderasyon kuralları başarıyla güncellendi.");
      await loadSettings();
    }
    setSaving(false);
  };

  if (loading)
    return (
      <main className="p-10 text-sm text-slate-500">Kurallar yükleniyor…</main>
    );

  return (
    <main className="ui-page-shell">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader eyebrow="İlan güvenliği ve risk politikası" title="Moderasyon Kuralları" description="Riskli ilanların hangi koşullarda otomatik veya yönetici incelemesine düşeceğini yönetin." icon={ShieldCheck} tone="amber" />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-700" />
            <div>
              <h2 className="font-bold text-amber-950">
                Acil manuel inceleme modu
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Açıldığında yeni oluşturulan bütün ilanlar yönetici onayına
                düşer.
              </p>
              <Toggle
                checked={settings.manual_review_all}
                onChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    manual_review_all: value,
                  }))
                }
              />
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <RuleCard
            title="Mükerrer ilan kontrolü"
            description="Aynı firmanın aynı başlıkla kısa sürede tekrar ilan vermesini incelemeye alır."
            enabled={settings.duplicate_review_enabled}
            onEnabled={(value) =>
              setSettings((current) => ({
                ...current,
                duplicate_review_enabled: value,
              }))
            }
          >
            <NumberField
              label="Kontrol süresi (saat)"
              value={settings.duplicate_window_hours}
              min={1}
              max={720}
              disabled={!settings.duplicate_review_enabled}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  duplicate_window_hours: value,
                }))
              }
            />
          </RuleCard>

          <RuleCard
            title="Yeni firma kontrolü"
            description="Yeni onaylanan firmaların ilanlarını belirlenen süre boyunca incelemeye alır."
            enabled={settings.new_company_review_enabled}
            onEnabled={(value) =>
              setSettings((current) => ({
                ...current,
                new_company_review_enabled: value,
              }))
            }
          >
            <NumberField
              label="Yeni firma süresi (gün)"
              value={settings.new_company_days}
              min={1}
              max={365}
              disabled={!settings.new_company_review_enabled}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  new_company_days: value,
                }))
              }
            />
          </RuleCard>

          <RuleCard
            title="Birim fiyat üst sınırı"
            description="Sınırı aşan birim fiyatlar incelemeye gönderilir."
            enabled={settings.maximum_unit_price !== null}
            onEnabled={(value) =>
              setSettings((current) => ({
                ...current,
                maximum_unit_price: value ? 1000000 : null,
              }))
            }
          >
            <NullableNumberField
              label="Azami birim fiyat (₺)"
              value={settings.maximum_unit_price}
              disabled={settings.maximum_unit_price === null}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  maximum_unit_price: value,
                }))
              }
            />
          </RuleCard>

          <RuleCard
            title="Miktar üst sınırı"
            description="Sınırı aşan ilan miktarları incelemeye gönderilir."
            enabled={settings.maximum_quantity !== null}
            onEnabled={(value) =>
              setSettings((current) => ({
                ...current,
                maximum_quantity: value ? 100000 : null,
              }))
            }
          >
            <NullableNumberField
              label="Azami miktar"
              value={settings.maximum_quantity}
              disabled={settings.maximum_quantity === null}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  maximum_quantity: value,
                }))
              }
            />
          </RuleCard>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
            <div>
              <h2 className="font-bold text-slate-950">Şüpheli kelimeler</h2>
              <p className="mt-1 text-sm text-slate-500">
                Her satıra bir kelime veya ifade yazın. Başlık ya da açıklamada
                eşleşen ilan incelemeye alınır.
              </p>
            </div>
          </div>
          <textarea
            value={blockedWordsText}
            onChange={(e) => setBlockedWordsText(e.target.value)}
            rows={6}
            placeholder={"yasaklı ifade\nşüpheli kelime"}
            className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
          />
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">
            Son güncelleme:{" "}
            {settings.updated_at
              ? new Date(settings.updated_at).toLocaleString("tr-TR")
              : "—"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadSettings()}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold"
            >
              <RefreshCw className="h-4 w-4" /> Yenile
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSettings()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />{" "}
              {saving ? "Kaydediliyor…" : "Kuralları kaydet"}
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${checked ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${checked ? "bg-white" : "bg-slate-500"}`}
      />
      {checked ? "Açık" : "Kapalı"}
    </button>
  );
}

function RuleCard({
  title,
  description,
  enabled,
  onEnabled,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <Toggle checked={enabled} onChange={onEnabled} />
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full rounded-xl border p-3 text-sm disabled:bg-slate-100 disabled:text-slate-400"
      />
    </label>
  );
}

function NullableNumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <input
        type="number"
        value={value ?? ""}
        min={0.01}
        step="0.01"
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full rounded-xl border p-3 text-sm disabled:bg-slate-100 disabled:text-slate-400"
      />
    </label>
  );
}
