
export const themes = {
  light: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    primary: "#6d28d9",
    primaryForeground: "#f5f3ff",
    secondary: "#f4f4f5",
    secondaryForeground: "#18181b",
    mutedForeground: "#737373",
    border: "#e5e5e5",
    ring: "#a3a3a3",
    positive: "#047857",
    warning: "#a16207",
    danger: "#b91c1c",
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    primary: "#8b5cf6",
    primaryForeground: "#f5f3ff",
    secondary: "#27272a",
    secondaryForeground: "#fafafa",
    mutedForeground: "#a3a3a3",
    border: "rgba(255, 255, 255, 0.10)",
    ring: "#737373",
    positive: "#34d399",
    warning: "#fbbf24",
    danger: "#f87171",
  },
} as const;

export type Theme = { [K in keyof (typeof themes)["light"]]: string };
export type ThemeMode = keyof typeof themes;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 36,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

export const font = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  extrabold: "Geist_800ExtraBold",
} as const;

export const fontSize = {
  label: 12,
  body: 16,
  action: 17,
  title: 20,
  hero: 44,
} as const;

export const touchTarget = 48;
