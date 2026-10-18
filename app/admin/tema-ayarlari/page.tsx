"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, Palette, RefreshCw, RotateCcw, Save, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  PLATFORM_THEME_DEFAULTS,
  THEME_OPTIONS,
  type ThemeScope,
  type ThemeSettings,
} from "@/config/platform-theme";
import {
  MetricCard,
  PageHeader,
  PageShell,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from "@/components/ui/PlatformUI";

const labels: Record<keyof ThemeSettings, string> = {
  primary: "Ana renk",
  accent: "Vurgu rengi",
  cardStyle: "Kart görünümü",
  radius: "Köşe biçimi",
  headingFont: "Başlık fontu",
  density: "İçerik yoğunluğu",
  pageWidth: "Sayfa genişliği",
  motion: "Animasyon seviyesi",
};

const optionLabels: Record<string, string> = {
  violet: "Violet",
  emerald: "Zümrüt",
  navy: "Lacivert",
  blue: "Mavi",
  amber: "Amber",
  cyan: "Camgöbeği",
  flat: "Düz",
  soft: "Yumuşak",
  elevated: "Gölgeli",
  glass: "Cam",
  outlined: "Çerçeveli",
  md: "Az yuvarlak",
  lg: "Yuvarlak",
  xl: "Geniş yuvarlak",
  "2xl": "Çok geniş",
  inter: "Inter",
  manrope: "Manrope",
  jakarta: "Plus Jakarta Sans",
  compact: "Kompakt",
  comfortable: "Normal",
  spacious: "Ferah",
  standard: "Standart",
  wide: "Geniş",
  full: "Tam genişlik",
  off: "Kapalı",
  reduced: "Azaltılmış",
  normal: "Normal",
};

const colorMap: Record<string, string> = {
  violet: "124 58 237",
  emerald: "5 150 105",
  navy: "15 23 42",
  blue: "37 99 235",
  amber: "217 119 6",
  cyan: "8 145 178",
};

export default function AdminThemeSettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [scope, setScope] = useState<ThemeScope>("admin");
  const [settings, setSettings] = useState<ThemeSettings>({ ...PLATFORM_THEME_DEFAULTS.admin });
  const [published, setPublished] = useState<ThemeSettings>({ ...PLATFORM_THEME_DEFAULTS.admin });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedScope: ThemeScope) => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("platform_theme_settings")
      .select("settings,published_settings")
      .eq("scope", selectedScope)
      .maybeSingle();

    const defaults = { ...PLATFORM_THEME_DEFAULTS[selectedScope] } as ThemeSettings;
    if (loadError) {
      setError(loadError.message);
      setSettings(defaults);
      setPublished(defaults);
    } else {
      setSettings({ ...defaults, ...(data?.settings ?? {}) });
      setPublished({ ...defaults, ...(data?.published_settings ?? {}) });
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(scope); }, [load, scope]);

  const save = async (publish: boolean) => {
    setSaving(publish ? "publish" : "draft");
    setError(null);
    setMessage(null);
    const { error: saveError } = await supabase.rpc("admin_save_platform_theme", {
      p_scope: scope,
      p_settings: settings,
      p_publish: publish,
    });
    if (saveError) setError(saveError.message);
    else {
      if (publish) {
        setPublished(settings);
        window.dispatchEvent(new CustomEvent("platform-theme-published", {
          detail: { scope },
        }));
      }
      setMessage(publish ? "Tema ayarları yayınlandı ve görünüm güncellendi." : "Tema taslağı kaydedildi.");
    }
    setSaving(null);
  };

  const defaults = PLATFORM_THEME_DEFAULTS[scope] as ThemeSettings;
  const previewStyle = {
    "--ui-primary": colorMap[settings.primary] ?? colorMap.violet,
    "--ui-accent": colorMap[settings.accent] ?? colorMap.emerald,
    "--ui-radius-card":
      settings.radius === "md" ? ".75rem" :
      settings.radius === "lg" ? "1rem" :
      settings.radius === "2xl" ? "2rem" : "1.5rem",
  } as React.CSSProperties;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Görsel sistem yönetimi"
        title="Tema Ayarları"
        description="Yönetim alanı ile kullanıcı ve pazar görünümünü merkezi seçeneklerle yönetin. Önce taslak kaydedebilir, ardından bütün platforma yayınlayabilirsiniz."
        icon={Palette}
        actions={
          <>
            <button onClick={() => void load(scope)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">
              <RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? "animate-spin" : ""}`} />Yenile
            </button>
            <button onClick={() => void save(false)} disabled={saving !== null} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-bold text-violet-700 disabled:opacity-50">
              <Save className="mr-2 inline h-4 w-4" />Taslağı kaydet
            </button>
            <button onClick={() => void save(true)} disabled={saving !== null} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              <Sparkles className="mr-2 inline h-4 w-4" />Yayınla
            </button>
          </>
        }
      />

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        {(["admin", "marketplace"] as ThemeScope[]).map((item) => (
          <button
            key={item}
            onClick={() => setScope(item)}
            className={`rounded-2xl border p-5 text-left transition ${scope === item ? "border-violet-300 bg-violet-50 ring-4 ring-violet-100" : "border-slate-200 bg-white hover:border-violet-200"}`}
          >
            <p className="text-sm font-black text-slate-900">{item === "admin" ? "Yönetim teması" : "Kullanıcı ve pazar teması"}</p>
            <p className="mt-1 text-xs text-slate-500">{item === "admin" ? "Yönetim panelleri ve denetim ekranları" : "Profil, şirket, ilan ve halka açık pazar alanları"}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <SurfaceCard>
          <SectionHeader
            title="Görünüm seçenekleri"
            description="Değişiklikler önce sağdaki önizlemeye uygulanır."
            actions={
              <button onClick={() => setSettings({ ...defaults })} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
                <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" />Varsayılan
              </button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(labels) as Array<keyof ThemeSettings>).map((key) => (
              <label key={key} className="space-y-1.5">
                <span className="text-xs font-extrabold text-slate-700">{labels[key]}</span>
                <select
                  value={settings[key]}
                  onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
                >
                  {THEME_OPTIONS[key].map((value) => <option key={value} value={value}>{optionLabels[value] ?? value}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            Yayındaki ana renk: <strong className="text-slate-800">{optionLabels[published.primary] ?? published.primary}</strong>
          </div>
        </SurfaceCard>

        <div
          style={previewStyle}
          className={scope === "admin" ? "theme-admin" : "theme-marketplace"}
          data-card-style={settings.cardStyle}
          data-density={settings.density}
          data-heading-font={settings.headingFont}
          data-motion={settings.motion}
        >
          <SurfaceCard className="overflow-hidden">
            <SectionHeader title="Canlı önizleme" description="Başlık, kart, durum ve metrik örnekleri" actions={<StatusBadge tone="emerald"><Eye className="mr-1 h-3 w-3" />Önizleme</StatusBadge>} />
            <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(var(--ui-primary),.12),rgba(255,255,255,.9))] p-5">
              <p className="ui-eyebrow">{scope === "admin" ? "Yönetim çalışma alanı" : "Güvenli ticaret ağı"}</p>
              <h2 className="ui-page-title mt-2">{scope === "admin" ? "Platform kontrol merkezi" : "Doğrulanmış ilan pazarı"}</h2>
              <p className="ui-page-description">Seçtiğiniz görünüm ortak bileşenleri kullanan bütün ilgili sayfalara uygulanır.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Aktif kayıt" value="128" helper="Güncel toplam" tone="violet" />
              <MetricCard label="Onaylanan" value="42" helper="Bu dönem" tone="emerald" />
              <MetricCard label="Bekleyen" value="7" helper="İnceleme gerekli" tone="amber" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge tone="emerald"><Check className="mr-1 h-3 w-3" />Onaylandı</StatusBadge>
              <StatusBadge tone="amber">İnceleme bekliyor</StatusBadge>
              <StatusBadge tone="red">Reddedildi</StatusBadge>
            </div>
          </SurfaceCard>
        </div>
      </div>
    </PageShell>
  );
}
