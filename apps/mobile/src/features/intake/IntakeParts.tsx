// Small building blocks for the notification intake screens, following the
// D4 intake flow (design/xxl-visual flows.js). Each part keeps the app's
// default look and, at XXXL, takes the D4 form from src/ui: paired cards,
// 36 dp row tiles, one-line status facts and a pinned footer.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps, type PropsWithChildren, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import {
  ActionBar as FooterBar, Choice, Group, IconTile as DesignIconTile, NoteCard as DesignNoteCard, Presentation,
  SecondaryButton, Text, ValueRow, useTheme, useThemeMode, type TextTone,
} from "../../ui/core";
import { alpha, mix } from "../../ui/design";
import { font, radius, spacing, touchTarget, type Theme } from "../../ui/tokens";
import { appInitial } from "./appCatalog";
import { useAppIcon } from "./appIcons";

type IconName = ComponentProps<typeof Ionicons>["name"];
export type Tone = "accent" | "positive" | "warning" | "danger" | "neutral";

// Violet text and icons on dark surfaces use the XXXL design's primaryText,
// since the dark primary (#7c3aed) is a fill colour and reads too dark as text.
const DARK_PRIMARY_TEXT = "#c4b5fd";

function toneColor(theme: Theme, tone: Tone, dark = false) {
  return tone === "accent" ? dark ? DARK_PRIMARY_TEXT : theme.primary : tone === "neutral" ? theme.foreground : theme[tone];
}
export function textToneOf(tone: Tone): TextTone {
  return tone === "accent" ? "primary" : tone === "neutral" ? "default" : tone;
}

/** A translucent surface in the tone's colour. Tone colours are opaque hex. */
function tint(theme: Theme, tone: Tone) {
  return tone === "neutral" ? theme.secondary : `${toneColor(theme, tone)}1f`;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    tile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    tileLarge: { width: 56, height: 56, borderRadius: radius.md },
    fact: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    copy: { flex: 1, minWidth: 0, gap: spacing.xs },
    card: { backgroundColor: theme.secondary, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.border, overflow: "hidden" },
    row: {
      minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md,
      paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
    },
    rowLast: { borderBottomWidth: 0 },
    note: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
    alert: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    check: {
      width: 26, height: 26, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center",
    },
    ghost: { minHeight: touchTarget, justifyContent: "center", alignSelf: "flex-start" },
    hero: { gap: spacing.sm },
    // XXXL (D4): 36 dp row tiles, 56 dp lead icons, full-width ghost buttons.
    rowTile: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0, borderWidth: 1 },
    lead: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    ghostWide: { minHeight: 56, alignSelf: "stretch", alignItems: "center", justifyContent: "center", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 18 },
  });
}

function useStyles() {
  const theme = useTheme();
  const dark = useThemeMode() === "dark";
  return { theme, dark, styles: useMemo(() => createStyles(theme), [theme]) };
}

/** A tinted tile with an icon or a letter. Rows use 36 dp tiles at XXXL; `large` is the page's state tile. */
export function IconTile({ icon, letter, tone = "neutral", large = false }: {
  icon?: IconName; letter?: string; tone?: Tone; large?: boolean;
}) {
  const { theme, dark, styles } = useStyles();
  const color = toneColor(theme, tone, dark);
  const legacy = <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={[styles.tile, large && styles.tileLarge, { backgroundColor: tint(theme, tone) }]}>
    {letter ? <Text preset="bodyStrong" style={{ color }}>{letter}</Text>
      : icon ? <Ionicons name={icon} size={large ? 28 : 22} color={color} /> : null}
  </View>;
  if (large) return legacy;
  if (icon) return <DesignIconTile icon={icon} tone={tone === "neutral" ? "neutral" : textToneOf(tone)} size={36} legacy={legacy} />;
  return <Presentation legacy={legacy}>
    <View accessible={false} importantForAccessibility="no-hide-descendants"
      style={[styles.rowTile, { backgroundColor: mix(color, theme.background, 0.15), borderColor: alpha(color, 0.32) }]}>
      {letter ? <Text variant="rowTitle">{letter}</Text> : null}
    </View>
  </Presentation>;
}

/** An app's own logo when Android lets Lukapp draw it, otherwise its first letter. */
export function AppTile({ packageName, label }: { packageName: string; label: string }) {
  const { styles } = useStyles();
  const uri = useAppIcon(packageName);
  if (!uri) return <IconTile letter={appInitial(label)} tone="accent" />;
  const logo = (style: object) => <Image accessible={false} importantForAccessibility="no" source={{ uri }} style={style} />;
  return <Presentation legacy={logo({ width: 40, height: 40, borderRadius: radius.sm })}>
    {logo([styles.rowTile, { borderWidth: 0 }])}
  </Presentation>;
}

/** The page's lead icon at XXXL (D4 `lead-icon`). */
export function LeadIcon({ icon, tone }: { icon: IconName; tone: Tone }) {
  const { theme, dark, styles } = useStyles();
  const color = toneColor(theme, tone, dark);
  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={[styles.lead, { backgroundColor: tone === "neutral" ? theme.secondary : mix(color, theme.background, 0.1) }]}>
    <Ionicons name={icon} size={28} color={color} />
  </View>;
}

/** A short fact: icon tile, a one-line title and an optional grey explanation. */
export function FactRow({ icon, tone = "accent", title, detail }: { icon: IconName; tone?: Tone; title: string; detail?: string }) {
  const { styles } = useStyles();
  return <View accessible accessibilityLabel={detail ? `${title}. ${detail}` : title} style={styles.fact}>
    <DesignIconTile icon={icon} tone={tone === "neutral" ? "neutral" : textToneOf(tone)} size={48} legacy={<IconTile icon={icon} tone={tone} />} />
    <View style={styles.copy}>
      <Text preset="rowTitle" tone="default">{title}</Text>
      {detail ? <Text preset="rowSubtitle" tone="muted">{detail}</Text> : null}
    </View>
  </View>;
}

/** A one-line status fact: an optional coloured state word with its icon, then muted text. */
export function StatusLine({ state, text, lines = 1 }: {
  state?: { label: string; tone: Tone; icon: IconName }; text?: string; lines?: number;
}) {
  const { theme, dark } = useStyles();
  const color = state ? toneColor(theme, state.tone, dark) : undefined;
  return <Text variant="status" tone="muted" numberOfLines={lines}>
    {state ? <Text variant="status" style={{ color, fontFamily: font.semibold }}>
      <Ionicons name={state.icon} size={18} color={color} />{` ${state.label}`}
    </Text> : null}
    {state && text ? " · " : ""}{text ?? ""}
  </Text>;
}

/** The page's main state: a large tile, a heading and one status line. */
export function HeroState({ icon, tone, title, status, statusTone, alert = false }: {
  icon: IconName; tone: Tone; title: string; status?: string; statusTone?: Tone; alert?: boolean;
}) {
  const { theme, dark, styles } = useStyles();
  return <View accessibilityLiveRegion="polite" style={styles.hero}>
    <Presentation legacy={<IconTile icon={icon} tone={tone} large />}><LeadIcon icon={icon} tone={tone} /></Presentation>
    <Text preset="stateTitle" tone="default" accessibilityRole="header">{title}</Text>
    {status ? <Text accessibilityRole={alert ? "alert" : undefined} preset="rowStatus" tone="muted"
      style={statusTone && { color: toneColor(theme, statusTone, dark), fontFamily: font.semibold }}>{status}</Text> : null}
  </View>;
}

export function SectionHeading({ title, meta }: { title: string; meta?: string }) {
  return <View style={{ gap: spacing.xs }}>
    <Text preset="groupHeading" tone="default" accessibilityRole="header">{title}</Text>
    {meta ? <Text preset="rowStatus" tone="muted">{meta}</Text> : null}
  </View>;
}

/** Rows that belong together. At XXXL they split into cards of at most two. */
export function Card({ children }: PropsWithChildren) {
  const { styles } = useStyles();
  return <Presentation legacy={<View style={styles.card}>{children}</View>}><Group>{children}</Group></Presentation>;
}

/** A row inside a Card: tile, title, one status line, chevron when it opens something. */
export function NavRow({ leading, title, status, statusTone, statusLines = 2, accessibilityLabel, onPress, disabled, last, isLast }: {
  leading?: ReactNode; title: string; status?: string; statusTone?: Tone; statusLines?: number; accessibilityLabel: string;
  onPress?: () => void; disabled?: boolean; last?: boolean;
  /** Set by Card at XXXL, where rows are paired. */
  isLast?: boolean;
}) {
  const { theme, dark, styles } = useStyles();
  const content = <>
    {leading}
    <View style={styles.copy}>
      <Text preset="rowTitle" tone="default">{title}</Text>
      {status ? <Text numberOfLines={statusLines} preset="rowSubtitle" tone="muted" style={statusTone && { color: toneColor(theme, statusTone, dark) }}>{status}</Text> : null}
    </View>
    {onPress ? <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} /> : null}
  </>;
  const style = [styles.row, last && styles.rowLast, disabled && { opacity: 0.45 }];
  const legacy = onPress ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={style}>{content}</Pressable>
    : <View accessible accessibilityLabel={accessibilityLabel} style={style}>{content}</View>;
  return <Presentation legacy={legacy}>
    <ValueRow title={title} leading={leading} onPress={onPress} disabled={onPress ? !!disabled : undefined}
      accessibilityLabel={accessibilityLabel} isLast={isLast ?? last}>
      {status ? <Text variant="status" tone={statusTone ? textToneOf(statusTone) : "muted"} numberOfLines={1}>{status}</Text> : null}
    </ValueRow>
  </Presentation>;
}

/** A titled card that replaces loose warning paragraphs. */
export function NoteCard({ tone, icon, title, body, action }: {
  tone: "warning" | "danger" | "accent"; icon: IconName; title: string; body?: string;
  action?: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean };
}) {
  const { styles, theme, dark } = useStyles();
  const button = action ? <SecondaryButton label={action.label} tone={action.danger ? "danger" : undefined}
    disabled={action.disabled} onPress={action.onPress} /> : null;
  return <Presentation legacy={<View accessibilityRole={tone === "accent" ? undefined : "alert"} style={[styles.note, { backgroundColor: tint(theme, tone) }]}>
    <View style={styles.fact}>
      <Ionicons name={icon} size={22} color={toneColor(theme, tone, dark)} />
      <View style={styles.copy}>
        <Text preset="rowTitle" tone="default">{title}</Text>
        {body ? <Text preset="rowSubtitle" tone="default">{body}</Text> : null}
      </View>
    </View>
    {button}
  </View>}>
    <View accessibilityRole={tone === "accent" ? undefined : "alert"} style={{ gap: spacing.md }}>
      <DesignNoteCard tone={tone === "accent" ? "neutral" : tone} icon={icon} title={title} body={body ?? ""} />
      {button}
    </View>
  </Presentation>;
}

/** A one-line failure at the top of a page, in red with an icon. */
export function AlertLine({ children }: { children: string }) {
  const { styles, theme } = useStyles();
  return <View style={styles.alert}>
    <Ionicons name="alert-circle" size={22} color={theme.danger} />
    <Text accessibilityRole="alert" preset="alertLine" tone="danger" style={{ flex: 1 }}>{children}</Text>
  </View>;
}

export function CheckRow({ label, detail, accessibilityLabel, checked, disabled, onPress, isLast }: {
  label: string; detail?: string; accessibilityLabel: string; checked: boolean; disabled?: boolean; onPress: () => void;
  /** Set by Card at XXXL. */
  isLast?: boolean;
}) {
  const { styles, theme } = useStyles();
  return <Presentation legacy={<Pressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ checked, disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={[styles.row, styles.rowLast, disabled && { opacity: 0.45 }]}>
    <View style={[styles.check, { borderColor: checked ? theme.primary : theme.ring, backgroundColor: checked ? theme.primary : "transparent" }]}>
      {checked ? <Ionicons name="checkmark" size={18} color={theme.primaryForeground} /> : null}
    </View>
    <View style={styles.copy}>
      <Text preset="rowTitle" tone="default">{label}</Text>
      {detail ? <Text preset="rowSubtitle" tone="muted">{detail}</Text> : null}
    </View>
  </Pressable>}>
    <Choice kind="checkbox" label={label} detail={detail} accessibilityLabel={accessibilityLabel}
      selected={checked} disabled={disabled} onPress={onPress} isLast={isLast ?? true} />
  </Presentation>;
}

export function TextButton({ label, onPress, expanded }: { label: string; onPress: () => void; expanded?: boolean }) {
  const { styles, theme, dark } = useStyles();
  const state = expanded === undefined ? undefined : { expanded };
  return <Presentation legacy={<Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={state} onPress={onPress} style={styles.ghost}>
    <Text preset="rowName" style={{ color: toneColor(theme, "accent", dark) }}>{label}</Text>
  </Pressable>}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={state} onPress={onPress} style={styles.ghostWide}>
      <Text variant="action" tone="primary" style={{ textAlign: "center" }}>{label}</Text>
    </Pressable>
  </Presentation>;
}

export function Muted({ children }: { children: string }) {
  return <Text preset="rowSubtitle" tone="muted">{children}</Text>;
}

/** Pinned actions at the bottom of a page, above the system navigation. */
export function ActionBar({ children }: PropsWithChildren) {
  const theme = useTheme();
  return <FooterBar legacy={<View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, backgroundColor: theme.background }}>
    {children}
  </View>}>{children}</FooterBar>;
}
