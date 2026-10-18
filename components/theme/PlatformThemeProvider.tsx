"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLATFORM_THEME_DEFAULTS, type ThemeScope, type ThemeSettings } from "@/config/platform-theme";

const colors: Record<string, string> = {
  violet: "124 58 237",
  emerald: "5 150 105",
  navy: "15 23 42",
  blue: "37 99 235",
  amber: "217 119 6",
  cyan: "8 145 178",
};

const radii: Record<string, string> = {
  md: ".75rem",
  lg: "1rem",
  xl: "1.5rem",
  "2xl": "2rem",
};

const widths: Record<string, string> = {
  standard: "1280px",
  wide: "1500px",
  full: "100%",
};

export default function PlatformThemeProvider({
  scope,
  children,
}: {
  scope: ThemeScope;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const defaults = PLATFORM_THEME_DEFAULTS[scope] as ThemeSettings;
  const [settings, setSettings] = useState<ThemeSettings>({ ...defaults });

  useEffect(() => {
    let mounted = true;

    const loadTheme = async () => {
      const { data, error } = await supabase.rpc("get_platform_theme", {
        p_scope: scope,
      });

      if (!mounted || error || !data) return;
      setSettings({ ...defaults, ...(data as Partial<ThemeSettings>) });
    };

    const handleThemePublished = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: ThemeScope }>).detail;
      if (!detail?.scope || detail.scope === scope) void loadTheme();
    };

    void loadTheme();
    window.addEventListener("platform-theme-published", handleThemePublished);

    return () => {
      mounted = false;
      window.removeEventListener("platform-theme-published", handleThemePublished);
    };
  }, [defaults, scope, supabase]);

  const style = {
    "--ui-primary": colors[settings.primary] ?? colors[defaults.primary],
    "--ui-accent": colors[settings.accent] ?? colors[defaults.accent],
    "--ui-radius-card": radii[settings.radius] ?? radii[defaults.radius],
    "--ui-page-width": widths[settings.pageWidth] ?? widths[defaults.pageWidth],
  } as CSSProperties;

  return (
    <div
      className={scope === "admin" ? "theme-admin" : "theme-marketplace"}
      data-card-style={settings.cardStyle}
      data-density={settings.density}
      data-heading-font={settings.headingFont}
      data-motion={settings.motion}
      style={style}
    >
      {children}
    </div>
  );
}
