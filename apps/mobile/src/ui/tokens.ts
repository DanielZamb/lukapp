// Design tokens — single source of truth for color, spacing, radius, and type.
// Colors come from the shared shadcn theme (:root and .dark), converted from
// OKLCH to hex because React Native does not parse oklch().

export const themes = {
  light: {
    background: "#ffffff", // --background oklch(1 0 0)
    foreground: "#0a0a0a", // --foreground oklch(0.145 0 0)
    primaryText: "#6d28d9",
    primary: "#6d28d9", // --primary oklch(0.491 0.27 292.581)
    primaryForeground: "#f5f3ff", // --primary-foreground oklch(0.969 0.016 293.756)
    secondary: "#f4f4f5", // --secondary oklch(0.967 0.001 286.375)
    secondaryForeground: "#18181b", // --secondary-foreground oklch(0.21 0.006 285.885)
    mutedForeground: "#6e6e6e", // 4.64:1 on secondary, user-approved 2026-10-17
    border: "#e5e5e5", // --border oklch(0.922 0 0)
    ring: "#8a8a8a", // 3.45:1 against white, user-approved 2026-10-17
    positive: "#047857",
    warning: "#9c5f06", // 4.71:1 on secondary, user-approved 2026-10-17
    danger: "#b91c1c",
  },
  dark: {
    background: "#0a0a0a", // --background oklch(0.145 0 0)
    foreground: "#fafafa", // --foreground oklch(0.985 0 0)
    // Spec --primary oklch(0.432 0.232 292.759) = #5b21b6 sits at ~2.9:1
    // against the near-black background; the dark --sidebar-primary violet
    // reads clearly as a surface, so tiles use it instead.
    primaryText: "#c4b5fd",
    primary: "#7c3aed", // 5.20:1 under primaryForeground, user-approved 2026-10-17
    primaryForeground: "#f5f3ff", // --primary-foreground oklch(0.969 0.016 293.756)
    secondary: "#27272a", // --secondary oklch(0.274 0.006 286.033)
    secondaryForeground: "#fafafa", // --secondary-foreground oklch(0.985 0 0)
    mutedForeground: "#a3a3a3", // --muted-foreground oklch(0.708 0 0)
    border: "rgba(255, 255, 255, 0.10)", // --border oklch(1 0 0 / 10%)
    ring: "#737373", // --ring oklch(0.556 0 0)
    positive: "#34d399",
    warning: "#fbbf24",
    danger: "#f87171",
  },
} as const;

export type Theme = { [K in keyof (typeof themes)["light"]]: string };
export type ThemeMode = keyof typeof themes;

// 4pt-base spacing scale. `section` separates the major screen zones.
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
  sm: 10, // --radius 0.625rem
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

// Geist, loaded in app/_layout.tsx. React Native needs one family name per
// weight — use these instead of fontWeight, which would fall back to the
// system font on Android.
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

// Fitts's Law guardrail for finger-operated controls.
export const touchTarget = 48;

export const xxxlFontScale = 1.3;

const defaultControls = {
  touchTarget,
  primaryButton: 56,
  secondaryButton: 48,
  input: 56,
  choiceRow: 76,
};

export const xxxl = {
  controls: { touchTarget: 56, primaryButton: 68, secondaryButton: 60, input: 64, choiceRow: 72 },
  spacing: { insideRow: 10, rowVertical: 24, rowHorizontal: 20, betweenGroups: 40, betweenSections: 48, pagePadding: 16 },
  radius: { control: 18, rowIcon: 14, card: 24, sheet: 28 },
};

export const controls = { default: defaultControls, reflow: defaultControls, xxxl: xxxl.controls };
