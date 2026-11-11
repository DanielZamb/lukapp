import { useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { useT } from "../../i18n";
import { useThemeContext } from "../../ui/themeContext";
import { font, fontSize, spacing, type Theme } from "../../ui/tokens";
import { formatMoney } from "../money";
import { amountHint } from "./hints";
import {
  confirmAmount, displayedMinorUnits, nativeText, readingShifted, withNativeText,
  type AmountSession,
} from "./session";

export type AmountFieldProps = {
  session: AmountSession;
  onChange: (next: AmountSession) => void;
  editable: boolean;
  /** The input's accessible name. */
  inputAccessibilityLabel: string;
  /** A visible label in the shared field style, which also gives the input the field's box. */
  label?: string;
  placeholder?: string;
  /** The owner's own message, shown when the text itself has no refusal to explain. */
  message?: { error?: string; helper?: string };
  notice?: string | null;
  InputComponent?: ComponentType<ComponentProps<typeof TextInput>>;
  inputStyle?: StyleProp<TextStyle>;
};

/**
 * The one input for an amount. The native field owns the text: the field reads it literally on every change event and
 * never writes to it while the person types, so the amount is always the text as shown. The grouped reading appears
 * under it.
 *
 * The field has no keys of its own. The decimal mark is typed on the phone's number pad. The sign is the owner's:
 * it is shown beside the input, never written into it, and a sign typed into the text is refused.
 *
 * The text the input shows is the field's own state, set in the same event as React Native's record of the native
 * text, so an owner that renders the field late, as a bottom sheet's portal does, cannot push an older text back. An
 * echo of a session the field emitted is never adopted, since it may be older than the last one. Any other session is
 * the owner's: one with other text or currency gets a new native input, so a change in flight from the old one cannot
 * reach it. While the field is not editable it shows the owner's text and takes no native change.
 *
 * The reading speaks up, in words and weight rather than colour alone, when a change could be misread at a glance:
 * it says the amount now reads differently, becomes a polite live region on Android and is announced on iOS. It
 * keeps its single line, so nothing moves under the person's thumb.
 */
export function AmountField(props: AmountFieldProps) {
  const { t } = useT();
  const { theme, ui, styles: shared } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const latest = useRef(props.session);
  const emitted = useRef(new WeakSet<AmountSession>());
  const focused = useRef(false);
  const seen = useRef<AmountSession | null>(displayedMinorUnits(props.session) === null ? null : props.session);
  const [shifted, setShifted] = useState(false);
  const [input, setInput] = useState({ seen: props.session, text: nativeText(props.session), generation: 0, autoFocus: false });
  let { generation } = input;
  if (input.seen !== props.session) {
    const owner = !emitted.current.has(props.session);
    const replaced = owner && (props.session.currency !== latest.current.currency || nativeText(props.session) !== input.text);
    if (owner) latest.current = props.session;
    if (replaced) {
      seen.current = displayedMinorUnits(props.session) === null ? null : props.session;
      if (shifted) setShifted(false);
      generation += 1;
    }
    setInput(replaced
      ? { seen: props.session, text: nativeText(props.session), generation, autoFocus: focused.current }
      : { ...input, seen: props.session });
  } else if (!props.editable && input.text !== nativeText(latest.current)) {
    setInput({ ...input, text: nativeText(latest.current) });
  }
  const current = useRef(generation);
  current.current = generation;
  const session = latest.current;
  const { editor, currency, review, sign } = session;
  const hint = amountHint(session, t);
  const Input = props.InputComponent ?? TextInput;
  function emit(next: AmountSession) {
    if (next === latest.current) return;
    if (next.editor.text !== latest.current.editor.text) {
      setShifted(readingShifted(seen.current, next));
      if (displayedMinorUnits(next) !== null) seen.current = next;
    }
    latest.current = next;
    emitted.current.add(next);
    props.onChange(next);
  }
  const mine = generation;
  const refused = !!hint || !!props.message?.error;
  const shown = editor.kind === "complete" ? formatMoney({ currency, minorUnits: editor.minorUnits }) : null;
  /** The grouped reading of the text. Its one line is always laid out, so nothing moves while the person types. */
  const reading = review ? null : shown;
  const emphasized = shifted && reading !== null;
  const spoken = reading === null ? null : t(emphasized ? "amount.readingChanged" : "amount.reading", { amount: reading });
  useEffect(() => {
    if (emphasized && spoken && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(spoken);
  }, [emphasized, spoken]);
  const reviewed = review && editor.kind === "complete" ? formatMoney({ currency, minorUnits: Math.abs(editor.minorUnits) }) : null;
  return (
    <View style={styles.field}>
      {props.label ? <Text style={shared.fieldLabel}>{props.label}</Text> : null}
      <View style={styles.row}>
        {sign ? (
          <Text style={[styles.signText, props.inputStyle, styles.signLayout]} accessibilityLabel={t(sign === "-" ? "amount.signMinus" : "amount.signPlus")}>
            {sign === "-" ? "−" : "+"}
          </Text>
        ) : null}
        <Input
          key={generation}
          autoFocus={input.autoFocus}
          accessibilityLabel={props.inputAccessibilityLabel}
          value={input.text}
          editable={props.editable}
          selectTextOnFocus={/^\s*[+−-]?0$/.test(input.text)}
          keyboardType="decimal-pad"
          autoCorrect={false}
          autoComplete="off"
          placeholder={props.placeholder}
          placeholderTextColor={theme.mutedForeground}
          cursorColor={theme.primary}
          selectionColor={theme.primary}
          onFocus={() => { focused.current = true; }}
          onBlur={() => { focused.current = false; }}
          onChangeText={(text) => {
            if (mine !== current.current || !props.editable) return;
            setInput((shown) => ({ ...shown, text }));
            emit(withNativeText(latest.current, text));
          }}
          style={[props.label ? [shared.fieldInput, styles.boxed, refused && shared.fieldInputInvalid] : null, styles.input, props.inputStyle]}
        />
      </View>
      {props.notice ? <Text style={ui.muted}>{props.notice}</Text> : null}
      {review && reviewed ? (
        <View style={styles.review} accessibilityLiveRegion="polite">
          <Text style={ui.body}>
            {review.converted && review.converted.previous !== null
              ? t("amount.reviewConverted", { previous: review.converted.previous, amount: reviewed })
              : t("amount.reviewPasted", { amount: reviewed })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("amount.reviewConfirm", { amount: reviewed })}
            accessibilityState={{ disabled: !props.editable }}
            disabled={!props.editable}
            onPress={() => emit(confirmAmount(latest.current))}
            style={({ pressed }) => [shared.secondaryButton, !props.editable && shared.buttonDisabled, pressed && shared.buttonPressed]}
          >
            <Text style={shared.secondaryButtonLabel}>{t("amount.reviewConfirm", { amount: reviewed })}</Text>
          </Pressable>
        </View>
      ) : null}
      {hint ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={ui.error}>{hint}</Text>
      ) : props.message?.error ? (
        <Text accessibilityRole="alert" style={ui.error}>{props.message.error}</Text>
      ) : (
        <>
          <Text style={[ui.muted, styles.reading, emphasized && styles.readingShifted]} numberOfLines={1} adjustsFontSizeToFit
            minimumFontScale={0.5} accessibilityLiveRegion={emphasized ? "polite" : "none"}
            importantForAccessibility={reading ? "auto" : "no-hide-descendants"}
            accessibilityElementsHidden={!reading}>{spoken ?? "\u00a0"}</Text>
          {props.message?.helper ? <Text style={ui.muted}>{props.message.helper}</Text> : null}
        </>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    field: { gap: spacing.xs },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    input: { flex: 1, minWidth: 0 },
    signText: { fontFamily: font.bold, fontSize: fontSize.body, color: theme.foreground },
    signLayout: { flex: 0, width: "auto", minWidth: spacing.md, minHeight: 0, paddingHorizontal: 0, textAlign: "center" },
    boxed: { width: "auto" },
    review: { gap: spacing.sm, paddingVertical: spacing.xs },
    reading: { lineHeight: Math.round(fontSize.body * 1.4) },
    readingShifted: { fontFamily: font.bold, color: theme.foreground },
  });
}
