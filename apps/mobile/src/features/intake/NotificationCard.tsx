// The kept notification shown inside the Post form while finishing a
// Candidate. The form's fields hold the suggestion; this card shows where it
// came from and lets the person correct it by tapping the notification:
// an amount to use it, or a first and a last word for the description.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemeMode } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget, type Theme } from "../../ui/tokens";
import { formatAmount, parseMoney } from "../money";
import { appInitial } from "./appCatalog";
import { IconTile } from "./IntakeParts";
import { pieces, suggest, type Mention } from "./suggest";

export type KeptNotification = { text: string; packageName: string; at: number };

const DARK_PRIMARY_TEXT = "#c4b5fd";

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: { borderRadius: radius.lg, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary, padding: spacing.lg, gap: spacing.sm },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    app: { fontFamily: font.semibold, fontSize: fontSize.body, color: theme.foreground },
    meta: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: theme.mutedForeground },
    text: { fontFamily: font.regular, fontSize: fontSize.body, lineHeight: 26, color: theme.foreground },
    reveal: { minHeight: touchTarget, justifyContent: "center", alignSelf: "flex-start" },
  });
}

export function NotificationCard({ notification, appLabel, currency, amount, editable, onUseAmount, onUseDescription }: {
  notification: KeptNotification;
  appLabel?: string;
  currency: string;
  /** The form's current signed amount text. */
  amount: string;
  editable: boolean;
  onUseAmount(minorUnits: number): void;
  onUseDescription(text: string): void;
}) {
  const theme = useTheme();
  const dark = useThemeMode() === "dark";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const suggestion = useMemo(() => suggest({ text: notification.text }), [notification.text]);
  const [revealed, setRevealed] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);
  const accent = dark ? DARK_PRIMARY_TEXT : theme.primary;
  const current = (() => { try { return Math.abs(parseMoney(amount, "es-CO", currency)); } catch { return null; } })();
  const chosen = suggestion.amounts.find((mention) => mention.minor === current) ?? null;
  const hidden = suggestion.sensitive !== null && !revealed;
  const label = appLabel ?? notification.packageName;

  function useWord(start: number, end: number) {
    if (!editable) return;
    if (anchor === null) { setAnchor(start); return; }
    const from = Math.min(anchor, start);
    const to = Math.max(end, anchor + 1);
    setAnchor(null);
    onUseDescription(suggestion.text.slice(from, to).replace(/\s+/g, " ").replace(/[.,;:]$/, "").trim());
  }
  const span = (kind: string, mention?: Mention) =>
    kind === "amount" || (mention && mention === chosen) ? { color: accent, fontFamily: font.bold, backgroundColor: `${theme.primary}26` }
    : mention ? { color: theme.mutedForeground, textDecorationLine: "underline" as const, textDecorationStyle: "dashed" as const }
    : kind === "counterparty" ? { fontFamily: font.semibold, backgroundColor: `${theme.warning}2e` }
    : kind === "direction" ? { textDecorationLine: "underline" as const }
    : kind === "when" ? { color: theme.mutedForeground } : null;

  return <View style={styles.card} accessibilityLabel={`Notification from ${label}`}>
    <View style={styles.head}>
      <IconTile letter={appInitial(label)} tone="accent" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.app} numberOfLines={1}>{label}</Text>
        <Text style={styles.meta}>{new Date(notification.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</Text>
      </View>
    </View>
    {hidden ? <>
      <Text style={styles.meta}>Hidden. It looks like a security code.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Show the notification" onPress={() => setRevealed(true)} style={styles.reveal}>
        <Text style={[styles.app, { color: accent }]}>Show it anyway</Text>
      </Pressable>
    </> : <>
      <Text style={styles.text}>
        {pieces(suggestion, chosen).map((piece) => {
          if (piece.mention) {
            const mention = piece.mention;
            return <Text key={piece.start} accessibilityRole="button" accessibilityLabel={`Use ${piece.text} as the amount`}
              onPress={editable ? () => { setAnchor(null); onUseAmount(mention.minor); } : undefined} style={span(piece.kind, mention)}>{piece.text}</Text>;
          }
          let offset = piece.start;
          return piece.text.split(/(\s+)/).map((word) => {
            const start = offset; offset += word.length;
            if (!word.trim()) return word;
            return <Text key={start} onPress={editable ? () => useWord(start, start + word.length) : undefined}
              style={[span(piece.kind), anchor === start && { backgroundColor: `${theme.primary}40` }]}>{word}</Text>;
          });
        })}
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.meta}>
        {anchor !== null ? "Now tap the last word of the description."
          : editable ? `Tap an amount to use it, or two words for the description.${suggestion.amounts.some((mention) => mention.role === "balance") ? " Dashed amounts look like balances." : ""}`
          : "From this notification."}
      </Text>
    </>}
  </View>;
}

/** The form's amount text for a tapped amount, keeping the sign the form already has. */
export function signedAmountText(minorUnits: number, currency: string, current: string, fallback: "in" | "out" | null) {
  const text = current.trim();
  // "-" alone is the form's empty expense; an empty form falls back to the suggested direction.
  const negative = /^[-−]/.test(text) || (text === "" && fallback === "out");
  return `${negative ? "-" : ""}${formatAmount(minorUnits, currency, { hideZeroDecimals: true })}`;
}
