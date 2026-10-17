export const PLATFORM_THEME_DEFAULTS = {
  admin: {
    primary: "violet",
    accent: "emerald",
    cardStyle: "elevated",
    radius: "xl",
    headingFont: "inter",
    density: "comfortable",
    pageWidth: "wide",
    motion: "normal",
  },
  marketplace: {
    primary: "emerald",
    accent: "amber",
    cardStyle: "soft",
    radius: "xl",
    headingFont: "inter",
    density: "comfortable",
    pageWidth: "wide",
    motion: "normal",
  },
} as const;

export type ThemeScope = keyof typeof PLATFORM_THEME_DEFAULTS;
export type ThemeSettings = {
  primary: string;
  accent: string;
  cardStyle: string;
  radius: string;
  headingFont: string;
  density: string;
  pageWidth: string;
  motion: string;
};

export const THEME_OPTIONS = {
  primary: ["violet", "emerald", "navy", "blue"],
  accent: ["emerald", "amber", "cyan", "violet"],
  cardStyle: ["flat", "soft", "elevated", "glass", "outlined"],
  radius: ["md", "lg", "xl", "2xl"],
  headingFont: ["inter", "manrope", "jakarta"],
  density: ["compact", "comfortable", "spacious"],
  pageWidth: ["standard", "wide", "full"],
  motion: ["off", "reduced", "normal"],
} as const;
