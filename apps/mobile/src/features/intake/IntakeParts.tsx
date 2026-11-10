// Small building blocks for the notification intake screens, following the
// D4 intake flow on xxl/d3-visual: icon tiles, fact rows, note cards and a
// one-line alert. They use the current tokens so the default tier keeps the
// app's look; they can move to src/ui once the XXXL foundation lands.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps, type PropsWithChildren, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SecondaryButton, useTheme, useThemeMode } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget, type Theme } from "../../ui/tokens";

type IconName = ComponentProps<typeof Ionicons>["name"];
export type Tone = "accent" | "positive" | "warning" | "danger" | "neutral";

// Violet text and icons on dark surfaces use the XXXL design's primaryText,
// since the dark primary (#7c3aed) is a fill colour and reads too dark as text.
const DARK_PRIMARY_TEXT = "#c4b5fd";

function toneColor(theme: Theme, tone: Tone, dark = false) {
  return tone === "accent" ? dark ? DARK_PRIMARY_TEXT : theme.primary : tone === "neutral" ? theme.foreground : theme[tone];
}

/** A translucent surface in the tone's colour. Tone colours are opaque hex. */
function tint(theme: Theme, tone: Tone) {
  return tone === "neutral" ? theme.secondary : `${toneColor(theme, tone)}1f`;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    tile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    tileLarge: { width: 56, height: 56, borderRadius: radius.md },
    letter: { fontFamily: font.bold, fontSize: fontSize.body },
    fact: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    copy: { flex: 1, minWidth: 0, gap: spacing.xs },
    title: { fontFamily: font.semibold, fontSize: fontSize.body, lineHeight: 22, color: theme.foreground },
    detail: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: theme.mutedForeground },
    section: { fontFamily: font.bold, fontSize: fontSize.title, lineHeight: 26, color: theme.foreground },
    card: { backgroundColor: theme.secondary, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.border, overflow: "hidden" },
    row: {
      minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md,
      paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
    },
    rowLast: { borderBottomWidth: 0 },
    note: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
    alert: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    alertText: { flex: 1, fontFamily: font.medium, fontSize: fontSize.body, lineHeight: 22, color: theme.danger },
    check: {
      width: 26, height: 26, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center",
    },
    ghost: { minHeight: touchTarget, justifyContent: "center", alignSelf: "flex-start" },
    ghostLabel: { fontFamily: font.semibold, fontSize: fontSize.body, color: theme.primary },
    hero: { gap: spacing.sm },
    heroTitle: { fontFamily: font.extrabold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: theme.foreground },
  });
}

function useStyles() {
  const theme = useTheme();
  const dark = useThemeMode() === "dark";
  return { theme, dark, styles: useMemo(() => createStyles(theme), [theme]) };
}

export function IconTile({ icon, letter, tone = "neutral", large = false }: {
  icon?: IconName; letter?: string; tone?: Tone; large?: boolean;
}) {
  const { theme, dark, styles } = useStyles();
  const color = toneColor(theme, tone, dark);
  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={[styles.tile, large && styles.tileLarge, { backgroundColor: tint(theme, tone) }]}>
    {letter ? <Text style={[styles.letter, { color }]}>{letter}</Text>
      : icon ? <Ionicons name={icon} size={large ? 28 : 22} color={color} /> : null}
  </View>;
}

/** A short fact: icon tile, a one-line title and an optional grey explanation. */
export function FactRow({ icon, tone = "accent", title, detail }: { icon: IconName; tone?: Tone; title: string; detail?: string }) {
  const { styles } = useStyles();
  return <View accessible accessibilityLabel={detail ? `${title}. ${detail}` : title} style={styles.fact}>
    <IconTile icon={icon} tone={tone} />
    <View style={styles.copy}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  </View>;
}

/** The page's main state: a large tile, a heading and one status line. */
export function HeroState({ icon, tone, title, status, statusTone, alert = false }: {
  icon: IconName; tone: Tone; title: string; status?: string; statusTone?: Tone; alert?: boolean;
}) {
  const { theme, dark, styles } = useStyles();
  return <View accessibilityLiveRegion="polite" style={styles.hero}>
    <IconTile icon={icon} tone={tone} large />
    <Text accessibilityRole="header" style={styles.heroTitle}>{title}</Text>
    {status ? <Text accessibilityRole={alert ? "alert" : undefined} style={[styles.detail, statusTone && { color: toneColor(theme, statusTone, dark), fontFamily: font.semibold }]}>{status}</Text> : null}
  </View>;
}

export function SectionHeading({ title, meta }: { title: string; meta?: string }) {
  const { styles } = useStyles();
  return <View style={{ gap: spacing.xs }}>
    <Text accessibilityRole="header" style={styles.section}>{title}</Text>
    {meta ? <Text style={styles.detail}>{meta}</Text> : null}
  </View>;
}

export function Card({ children }: PropsWithChildren) {
  const { styles } = useStyles();
  return <View style={styles.card}>{children}</View>;
}

/** A row inside a Card: tile, title, a status that wraps unless `statusLines` clamps it, chevron when it opens something. */
export function NavRow({ leading, title, status, statusTone, statusLines, accessibilityLabel, onPress, disabled, last }: {
  leading?: ReactNode; title: string; status?: string; statusTone?: Tone; statusLines?: number; accessibilityLabel: string;
  onPress?: () => void; disabled?: boolean; last?: boolean;
}) {
  const { theme, dark, styles } = useStyles();
  const content = <>
    {leading}
    <View style={styles.copy}>
      <Text style={styles.title}>{title}</Text>
      {status ? <Text numberOfLines={statusLines} style={[styles.detail, statusTone && { color: toneColor(theme, statusTone, dark) }]}>{status}</Text> : null}
    </View>
    {onPress ? <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} /> : null}
  </>;
  const style = [styles.row, last && styles.rowLast, disabled && { opacity: 0.45 }];
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={style}>{content}</Pressable>
    : <View accessible accessibilityLabel={accessibilityLabel} style={style}>{content}</View>;
}

/** A titled card that replaces loose warning paragraphs. */
export function NoteCard({ tone, icon, title, body, action }: {
  tone: "warning" | "danger" | "accent"; icon: IconName; title: string; body?: string;
  action?: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean };
}) {
  const { styles, theme, dark } = useStyles();
  return <View accessibilityRole={tone === "accent" ? undefined : "alert"} style={[styles.note, { backgroundColor: tint(theme, tone) }]}>
    <View style={styles.fact}>
      <Ionicons name={icon} size={22} color={toneColor(theme, tone, dark)} />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={[styles.detail, { color: theme.foreground }]}>{body}</Text> : null}
      </View>
    </View>
    {action ? <SecondaryButton label={action.label} tone={action.danger ? "danger" : undefined}
      disabled={action.disabled} onPress={action.onPress} /> : null}
  </View>;
}

/** A one-line failure at the top of a page, in red with an icon. */
export function AlertLine({ children }: { children: string }) {
  const { styles, theme } = useStyles();
  return <View style={styles.alert}>
    <Ionicons name="alert-circle" size={22} color={theme.danger} />
    <Text accessibilityRole="alert" style={styles.alertText}>{children}</Text>
  </View>;
}

export function CheckRow({ label, detail, accessibilityLabel, checked, disabled, onPress }: {
  label: string; detail?: string; accessibilityLabel: string; checked: boolean; disabled?: boolean; onPress: () => void;
}) {
  const { styles, theme } = useStyles();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ checked, disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={[styles.row, styles.rowLast, disabled && { opacity: 0.45 }]}>
    <View style={[styles.check, { borderColor: checked ? theme.primary : theme.ring, backgroundColor: checked ? theme.primary : "transparent" }]}>
      {checked ? <Ionicons name="checkmark" size={18} color={theme.primaryForeground} /> : null}
    </View>
    <View style={styles.copy}>
      <Text style={styles.title}>{label}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  </Pressable>;
}

export function TextButton({ label, onPress, expanded }: { label: string; onPress: () => void; expanded?: boolean }) {
  const { styles, theme, dark } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress} style={styles.ghost}>
    <Text style={[styles.ghostLabel, { color: toneColor(theme, "accent", dark) }]}>{label}</Text>
  </Pressable>;
}

export function Muted({ children }: { children: string }) {
  const { styles } = useStyles();
  return <Text style={styles.detail}>{children}</Text>;
}

/** Pinned actions at the bottom of a page, above the system navigation. */
export function ActionBar({ children }: PropsWithChildren) {
  const theme = useTheme();
  return <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, backgroundColor: theme.background }}>
    {children}
  </View>;
}
