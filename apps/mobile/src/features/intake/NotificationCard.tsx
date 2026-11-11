// The kept notification shown inside the Post form while finishing a
// Candidate. The form's fields hold the suggestion; this card shows where it
// came from and lets the person correct it by tapping the notification:
// an amount to use it, or a first and a last word for the description.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text as Span, View } from "react-native";
import { Presentation, Text, useControls, useTheme, useThemeMode } from "../../ui/core";
import { font, radius, spacing, xxxl, type Theme } from "../../ui/tokens";
import { amountOfMinorUnits, amountSign, displayedMinorUnits, type AmountSession } from "../amount/session";
import { AppTile } from "./IntakeParts";
import { pieces, suggest, type Mention } from "./suggest";
import { formatDateTime, useT } from "../../i18n";

export type KeptNotification = { text: string; packageName: string; at: number };

const DARK_PRIMARY_TEXT = "#c4b5fd";

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: { borderRadius: radius.lg, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary, padding: spacing.lg, gap: spacing.sm },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    reveal: { justifyContent: "center", alignSelf: "flex-start" },
  });
}

export function NotificationCard({ notification, appLabel, currency, amount, editable, onUseAmount, onUseDescription }: {
  notification: KeptNotification;
  appLabel?: string;
  currency: string;
  /** The form's current signed amount. */
  amount: AmountSession;
  editable: boolean;
  onUseAmount(minorUnits: number): void;
  onUseDescription(text: string): void;
}) {
  const { t, language } = useT();
  const theme = useTheme();
  const dark = useThemeMode() === "dark";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const controls = useControls();
  const suggestion = useMemo(() => suggest({ text: notification.text }), [notification.text]);
  const [revealed, setRevealed] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null);
  const accent = dark ? DARK_PRIMARY_TEXT : theme.primary;
  const typed = displayedMinorUnits(amount);
  const current = typed === null ? null : Math.abs(typed);
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

  const content = <>
    <Text preset="rowName" tone="default">{t("inbox.cardTitle")}</Text>
    <View style={styles.head}>
      <AppTile packageName={notification.packageName} label={label} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text preset="rowName" tone="default" numberOfLines={2}>{label}</Text>
        <Text preset="noticeMeta" tone="muted">{formatDateTime(language, notification.at)}</Text>
      </View>
    </View>
    {!notification.text.trim() ? <>
      <Text preset="rowName" tone="default">{t("inbox.cardTextUnavailable")}</Text>
      <Text preset="noticeMeta" tone="muted">{t("inbox.cardTextUnavailableBody")}</Text>
    </> : hidden ? <>
      <Text preset="noticeMeta" tone="muted">{t("inbox.cardHidden")}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.cardShowA11y")} onPress={() => setRevealed(true)} style={[styles.reveal, { minHeight: controls.touchTarget }]}>
        <Text preset="rowName" style={{ color: accent }}>{t("inbox.cardShow")}</Text>
      </Pressable>
    </> : <>
      <Text preset="noticeText" tone="default" accessibilityLabel={notification.text}>
        {pieces(suggestion, chosen).map((piece) => {
          if (piece.mention) {
            const mention = piece.mention;
            return <Span key={piece.start} accessibilityRole="button" accessibilityLabel={t("inbox.cardUseAmountA11y", { amount: piece.text })}
              onPress={editable ? () => { setAnchor(null); onUseAmount(mention.minor); } : undefined} style={span(piece.kind, mention)}>{piece.text}</Span>;
          }
          let offset = piece.start;
          return piece.text.split(/(\s+)/).map((word) => {
            const start = offset; offset += word.length;
            if (!word.trim()) return word;
            return <Span key={start} onPress={editable ? () => useWord(start, start + word.length) : undefined}
              style={[span(piece.kind), anchor === start && { backgroundColor: `${theme.primary}40` }]}>{word}</Span>;
          });
        })}
      </Text>
      <Text accessibilityLiveRegion="polite" preset="noticeMeta" tone="muted">
        {anchor !== null ? t("inbox.cardHintLastWord")
          : editable ? [
            t(suggestion.amounts.length ? "inbox.cardHintTapAmount" : "inbox.cardHintEnterAmount"),
            ...(suggestion.amounts.some((mention) => mention.role === "balance") ? [t("inbox.cardHintBalances")] : []),
          ].join(" ")
          : t("inbox.cardReadOnly")}
      </Text>
    </>}
  </>;
  const card = (style: object) => <View style={style} accessibilityLabel={t("inbox.cardA11y", { app: label })}>{content}</View>;
  return <Presentation legacy={card(styles.card)}>{card([styles.card, { borderRadius: xxxl.radius.card }])}</Presentation>;
}

/**
 * The form's amount for a tapped notification amount: the already extracted minor units, written in the workspace
 * currency's format, keeping the sign the form already has. An empty form falls back to the suggested direction.
 */
export function signedAmount(minorUnits: number, currency: string, current: AmountSession, fallback: "in" | "out" | null) {
  const negative = amountSign(current) === "-" || (current.editor.text.trim() === "" && fallback === "out");
  return amountOfMinorUnits(currency, negative ? -minorUnits : minorUnits, { hideZeroDecimals: true });
}
