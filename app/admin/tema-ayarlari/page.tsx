"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Eye,
  History,
  Monitor,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
} from "lucide-react";
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

type PreviewDevice = "desktop" | "tablet" | "mobile";
type ThemeHistoryRow = {
  id: string;
  settings: ThemeSettings;
  published_at: string;
  published_by_email: string | null;
};

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

const colorHex: Record<string, string> = {
  violet: "#7c3aed",
  emerald: "#059669",
  navy: "#0f172a",
  blue: "#2563eb",
  amber: "#d97706",
  cyan: "#0891b2",
};

const presets: Array<{ name: string; description: string; settings: ThemeSettings }> = [
  {
    name: "Kurumsal VIP",
    description: "Güçlü kontrast, gölgeli kartlar ve ferah çalışma alanı.",
    settings: {
      primary: "navy",
      accent: "emerald",
      cardStyle: "elevated",
      radius: "xl",
      headingFont: "manrope",
      density: "comfortable",
      pageWidth: "wide",
      motion: "normal",
    },
  },
  {
    name: "Modern Pazar",
    description: "Canlı renkler, yumuşak yüzeyler ve satış odaklı görünüm.",
    settings: {
      primary: "emerald",
      accent: "amber",
      cardStyle: "soft",
      radius: "2xl",
      headingFont: "jakarta",
      density: "comfortable",
      pageWidth: "wide",
      motion: "normal",
    },
  },
  {
    name: "Operasyon",
    description: "Yoğun yönetim ekranları için kompakt ve net düzen.",
    settings: {
      primary: "blue",
      accent: "cyan",
      cardStyle: "outlined",
      radius: "lg",
      headingFont: "inter",
      density: "compact",
      pageWidth: "full",
      motion: "reduced",
    },
  },
];

const sameSettings = (left: ThemeSettings, right: ThemeSettings) =>
  (Object.keys(labels) as Array<keyof ThemeSettings>).every((key) => left[key] === right[key]);

export default function AdminThemeSettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [scope, setScope] = useState<ThemeScope>("admin");
  const [settings, setSettings] = useState<ThemeSettings>({ ...PLATFORM_THEME_DEFAULTS.admin });
  const [published, setPublished] = useState<ThemeSettings>({ ...PLATFORM_THEME_DEFAULTS.admin });
  const [history, setHistory] = useState<ThemeHistoryRow[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishedBy, setPublishedBy] = useState<string | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "publish" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedScope: ThemeScope) => {
    setLoading(true);
    setError(null);
    const defaults = { ...PLATFORM_THEME_DEFAULTS[selectedScope] } as ThemeSettings;
    const { data: editorData, error: editorError } = await supabase.rpc(
      "admin_get_theme_editor_state",
      { p_scope: selectedScope },
    );

    if (!editorError && editorData) {
      setSettings({ ...defaults, ...(editorData.settings ?? {}) });
      setPublished({ ...defaults, ...(editorData.published_settings ?? {}) });
      setHistory((editorData.history ?? []) as ThemeHistoryRow[]);
      setPublishedAt(editorData.published_at ?? null);
      setPublishedBy(editorData.published_by_email ?? null);
      setLoading(false);
      return;
    }

    const { data, error: loadError } = await supabase
      .from("platform_theme_settings")
      .select("settings,published_settings")
      .eq("scope", selectedScope)
      .maybeSingle();

    if (loadError) {
      setError(editorError?.message || loadError.message);
      setSettings(defaults);
      setPublished(defaults);
    } else {
      setSettings({ ...defaults, ...(data?.settings ?? {}) });
      setPublished({ ...defaults, ...(data?.published_settings ?? {}) });
      setHistory([]);
      setPublishedAt(null);
      setPublishedBy(null);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load(scope);
  }, [load, scope]);

  const save = async (publish: boolean) => {
    setSaving(publish ? "publish" : "draft");
    setError(null);
    setMessage(null);
    const { error: saveError } = await supabase.rpc("admin_save_platform_theme", {
      p_scope: scope,
      p_settings: settings,
      p_publish: publish,
    });
    if (saveError) {
      setError(saveError.message);
    } else {
      if (publish) {
        window.dispatchEvent(new CustomEvent("platform-theme-published", {
          detail: { scope },
        }));
      }
      setMessage(publish
        ? "Tema yayınlandı. İlgili bütün ekranlar yeni tasarım dilini kullanıyor."
        : "Tema taslağı kaydedildi.");
      await load(scope);
    }
    setSaving(null);
  };

  const restore = async (item: ThemeHistoryRow) => {
    if (!window.confirm("Bu sürüm yeniden yayınlansın mı? Mevcut yayın geçmişte saklanacaktır.")) return;
    setSaving("restore");
    setError(null);
    setMessage(null);
    const { error: restoreError } = await supabase.rpc("admin_restore_platform_theme", {
      p_scope: scope,
      p_history_id: item.id,
    });
    if (restoreError) {
      setError(restoreError.message);
    } else {
      window.dispatchEvent(new CustomEvent("platform-theme-published", {
        detail: { scope },
      }));
      setMessage("Seçilen tema sürümü yeniden yayınlandı.");
      await load(scope);
    }
    setSaving(null);
  };

  const defaults = PLATFORM_THEME_DEFAULTS[scope] as ThemeSettings;
  const changedKeys = (Object.keys(labels) as Array<keyof ThemeSettings>)
    .filter((key) => settings[key] !== published[key]);
  const hasChanges = changedKeys.length > 0;

  const previewStyle = {
    "--ui-primary": colorMap[settings.primary] ?? colorMap.violet,
    "--ui-accent": colorMap[settings.accent] ?? colorMap.emerald,
    "--ui-radius-card":
      settings.radius === "md" ? ".75rem" :
      settings.radius === "lg" ? "1rem" :
      settings.radius === "2xl" ? "2rem" : "1.5rem",
  } as React.CSSProperties;

  const deviceWidth = device === "mobile" ? "390px" : device === "tablet" ? "760px" : "100%";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Görsel sistem yönetimi"
        title="Tema Ayarları"
        description="Yönetim ve pazar arayüzlerini tek merkezden tasarlayın, cihazlarda önizleyin ve güvenle yayınlayın."
        icon={Palette}
        actions={
          <>
            <button onClick={() => void load(scope)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">
              <RefreshCw className={"mr-2 inline h-4 w-4 " + (loading ? "animate-spin" : "")} />Yenile
            </button>
            <button onClick={() => void save(false)} disabled={saving !== null} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-bold text-violet-700 disabled:opacity-50">
              <Save className="mr-2 inline h-4 w-4" />Taslağı kaydet
            </button>
            <button onClick={() => void save(true)} disabled={saving !== null || !hasChanges} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
              <Sparkles className="mr-2 inline h-4 w-4" />{hasChanges ? "Yayınla (" + changedKeys.length + ")" : "Yayında"}
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
            className={"rounded-2xl border p-5 text-left transition " + (scope === item ? "border-violet-300 bg-violet-50 ring-4 ring-violet-100" : "border-slate-200 bg-white hover:border-violet-200")}
          >
            <p className="text-sm font-black text-slate-900">{item === "admin" ? "Yönetim teması" : "Kullanıcı ve pazar teması"}</p>
            <p className="mt-1 text-xs text-slate-500">{item === "admin" ? "Yönetim panelleri ve denetim ekranları" : "Profil, şirket, ilan ve halka açık pazar alanları"}</p>
          </button>
        ))}
      </div>

      <SurfaceCard>
        <SectionHeader
          title="Hazır tasarım paketleri"
          description="İyi dengelenmiş bir başlangıç seçin; ardından bütün ayrıntıları özelleştirebilirsiniz."
        />
        <div className="grid gap-3 md:grid-cols-3">
          {presets.map((preset) => {
            const selected = sameSettings(settings, preset.settings);
            return (
              <button
                key={preset.name}
                onClick={() => setSettings({ ...preset.settings })}
                className={"rounded-2xl border p-4 text-left transition " + (selected ? "border-violet-300 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-slate-50 hover:border-violet-200 hover:bg-white")}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black text-slate-900">{preset.name}</span>
                  <span className="flex gap-1">
                    <i className="h-4 w-4 rounded-full border-2 border-white shadow" style={{ background: colorHex[preset.settings.primary] }} />
                    <i className="h-4 w-4 rounded-full border-2 border-white shadow" style={{ background: colorHex[preset.settings.accent] }} />
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]">
        <SurfaceCard>
          <SectionHeader
            title="Görünüm seçenekleri"
            description="Renk, yüzey, tipografi ve yerleşim kararlarını yönetin."
            actions={
              <button onClick={() => setSettings({ ...defaults })} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
                <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" />Varsayılan
              </button>
            }
          />
          <div className="space-y-5">
            {(Object.keys(labels) as Array<keyof ThemeSettings>).map((key) => {
              const isColor = key === "primary" || key === "accent";
              return (
                <div key={key}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-extrabold text-slate-700">{labels[key]}</span>
                    {settings[key] !== published[key] && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">Değiştirildi</span>}
                  </div>
                  <div className={isColor ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
                    {THEME_OPTIONS[key].map((value) => {
                      const selected = settings[key] === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setSettings((current) => ({ ...current, [key]: value }))}
                          className={"flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition " + (selected ? "border-violet-300 bg-violet-50 text-violet-800 ring-2 ring-violet-100" : "border-slate-200 bg-white text-slate-600 hover:border-violet-200")}
                        >
                          {isColor && <span className="h-4 w-4 shrink-0 rounded-full border-2 border-white shadow" style={{ background: colorHex[value] }} />}
                          <span className="truncate">{optionLabels[value] ?? value}</span>
                          {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SurfaceCard>

        <div className="space-y-5">
          <SurfaceCard>
            <SectionHeader
              title="Canlı önizleme"
              description="Değişiklikleri yayınlamadan önce farklı ekranlarda kontrol edin."
              actions={
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {([
                    ["desktop", Monitor],
                    ["tablet", Tablet],
                    ["mobile", Smartphone],
                  ] as const).map(([value, Icon]) => (
                    <button
                      key={value}
                      title={value === "desktop" ? "Masaüstü" : value === "tablet" ? "Tablet" : "Telefon"}
                      onClick={() => setDevice(value)}
                      className={"rounded-lg p-2 " + (device === value ? "bg-white text-violet-700 shadow-sm" : "text-slate-400")}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              }
            />
            <div className="overflow-x-auto rounded-2xl bg-slate-100 p-3 sm:p-5">
              <div
                style={{ ...previewStyle, width: deviceWidth }}
                className={(scope === "admin" ? "theme-admin" : "theme-marketplace") + " mx-auto transition-all duration-300"}
                data-card-style={settings.cardStyle}
                data-density={settings.density}
                data-heading-font={settings.headingFont}
                data-motion={settings.motion}
              >
                <div className="rounded-[var(--ui-radius-card)] border border-white/70 bg-white p-4 shadow-xl shadow-slate-200/70 sm:p-6">
                  <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(var(--ui-primary),.16),rgba(255,255,255,.94))] p-5">
                    <p className="ui-eyebrow">{scope === "admin" ? "Yönetim çalışma alanı" : "Güvenli ticaret ağı"}</p>
                    <h2 className="ui-page-title mt-2">{scope === "admin" ? "Platform kontrol merkezi" : "Doğrulanmış ilan pazarı"}</h2>
                    <p className="ui-page-description">Seçtiğiniz görünüm ortak bileşenleri kullanan bütün ilgili sayfalara uygulanır.</p>
                  </div>
                  <div className={"mt-4 grid gap-3 " + (device === "mobile" ? "grid-cols-1" : "grid-cols-3")}>
                    <MetricCard label="Aktif kayıt" value="128" helper="Güncel toplam" tone="violet" />
                    <MetricCard label="Onaylanan" value="42" helper="Bu dönem" tone="emerald" />
                    <MetricCard label="Bekleyen" value="7" helper="İnceleme gerekli" tone="amber" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge tone="emerald"><Check className="mr-1 h-3 w-3" />Onaylandı</StatusBadge>
                    <StatusBadge tone="amber">İnceleme bekliyor</StatusBadge>
                    <StatusBadge tone="red">Reddedildi</StatusBadge>
                  </div>
                </div>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionHeader
              title="Yayın durumu"
              description={hasChanges ? changedKeys.length + " ayar yayındaki sürümden farklı." : "Taslak ile yayındaki sürüm aynı."}
              actions={<StatusBadge tone={hasChanges ? "amber" : "emerald"}>{hasChanges ? "Taslak değişti" : "Güncel"}</StatusBadge>}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Son yayın</p>
                <p className="mt-2 text-sm font-bold text-slate-800">{publishedAt ? new Date(publishedAt).toLocaleString("tr-TR") : "Bilgi bulunmuyor"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Yayınlayan</p>
                <p className="mt-2 truncate text-sm font-bold text-slate-800">{publishedBy || "Bilgi bulunmuyor"}</p>
              </div>
            </div>
            {hasChanges && (
              <div className="mt-3 flex flex-wrap gap-2">
                {changedKeys.map((key) => <span key={key} className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700">{labels[key]}</span>)}
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>

      <SurfaceCard>
        <SectionHeader
          title="Yayın geçmişi"
          description="Önceki tema sürümlerini inceleyin veya tek işlemle yeniden yayınlayın."
          actions={<StatusBadge tone="slate"><History className="mr-1 h-3 w-3" />{history.length} sürüm</StatusBadge>}
        />
        {history.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {history.map((item, index) => (
              <div key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Clock3 className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">{index === 0 ? "Son yayınlanan sürüm" : new Date(item.published_at).toLocaleString("tr-TR")}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.published_by_email || "Sistem"} · {optionLabels[item.settings.primary] ?? item.settings.primary} / {optionLabels[item.settings.cardStyle] ?? item.settings.cardStyle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-4 w-4 rounded-full border-2 border-white shadow" style={{ background: colorHex[item.settings.primary] }} />
                  <span className="h-4 w-4 rounded-full border-2 border-white shadow" style={{ background: colorHex[item.settings.accent] }} />
                </div>
                <button
                  onClick={() => void restore(item)}
                  disabled={saving !== null || sameSettings(published, item.settings)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" />{sameSettings(published, item.settings) ? "Yayında" : "Geri yükle"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <History className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-600">Henüz yayın geçmişi yok</p>
            <p className="mt-1 text-xs text-slate-400">Migration çalıştırıldıktan sonraki yayınlar burada saklanacaktır.</p>
          </div>
        )}
      </SurfaceCard>
    </PageShell>
  );
}
