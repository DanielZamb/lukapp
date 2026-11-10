import { useMemo, useRef, useState, type ComponentProps, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { useT } from "../../i18n";
import { useThemeContext } from "../../ui/themeContext";
import { font, fontSize, radius, spacing, touchTarget, type Theme } from "../../ui/tokens";
import { formatMoney } from "../money";
import { amountHint } from "./hints";
import { confirmAmount, toggleAmountSign, withDecimalMark, withNativeText, type AmountSession } from "./session";

type Caret = { start: number; end: number };

export type AmountFieldProps = {
  session: AmountSession;
  onChange: (next: AmountSession) => void;
  editable: boolean;
  /** The input's accessible name. */
  inputAccessibilityLabel: string;
  /** A visible label in the shared field style, which also gives the input the field's box. */
  label?: string;
  placeholder?: string;
  /** A control that sets the sign, for fields that accept a negative amount. */
  sign?: { disabled?: boolean };
  /** The owner's own message, shown when the text itself has no refusal to explain. */
  message?: { error?: string; helper?: string };
  notice?: string | null;
  InputComponent?: ComponentType<ComponentProps<typeof TextInput>>;
  inputStyle?: StyleProp<TextStyle>;
};

/**
 * The one input for an amount. The native field owns the text: the field reads it literally on every change and never
 * rewrites it while the person types, so the amount is always the text as shown. The grouped reading appears under
 * it. The decimal and sign keys are the only edits the field writes itself, and the caret is placed only after them.
 * A session the owner replaces gets a new native input, so a change still in flight from the old one cannot reach it.
 */
export function AmountField(props: AmountFieldProps) {
  const { t } = useT();
  const { theme, ui, styles: shared } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const latest = useRef(props.session);
  latest.current = props.session;
  const emitted = useRef<AmountSession | null>(null);
  const caret = useRef<Caret>({ start: props.session.editor.text.length, end: props.session.editor.text.length });
  const focused = useRef(false);
  const [input, setInput] = useState({ session: props.session, generation: 0, autoFocus: false });
  const [placed, setPlaced] = useState<Caret | undefined>(undefined);
  let { generation } = input;
  if (input.session !== props.session) {
    const own = props.session === emitted.current || (props.session.currency === input.session.currency
      && props.session.editor.text === input.session.editor.text);
    if (!own) {
      generation += 1;
      const end = props.session.editor.text.length;
      caret.current = { start: end, end };
    }
    setInput({ session: props.session, generation, autoFocus: own ? input.autoFocus : focused.current });
    if (!own && placed) setPlaced(undefined);
  }
  const current = useRef(generation);
  current.current = generation;
  const { editor, currency, review } = props.session;
  const { decimal } = editor.format.convention;
  const decimals = editor.format.precision > 0;
  const hint = amountHint(props.session, t);
  const Input = props.InputComponent ?? TextInput;
  function emit(next: AmountSession) {
    if (next === latest.current) return;
    latest.current = next;
    emitted.current = next;
    props.onChange(next);
  }
  /** An edit of the field's own keys, with the caret it leaves. */
  function press(next: AmountSession, at: number) {
    caret.current = { start: at, end: at };
    setPlaced({ start: at, end: at });
    emit(next);
  }
  const mine = generation;
  const keyEnabled = props.editable && decimals;
  const refused = !!hint || !!props.message?.error;
  const shown = editor.kind === "complete" ? formatMoney({ currency, minorUnits: editor.minorUnits }) : null;
  /** The grouped reading of the text. Its line is always laid out, so the keys never move while the person types. */
  const reading = review ? null : shown;
  const reviewed = review && editor.kind === "complete" ? formatMoney({ currency, minorUnits: Math.abs(editor.minorUnits) }) : null;
  return (
    <View style={styles.field}>
      {props.label ? <Text style={shared.fieldLabel}>{props.label}</Text> : null}
      <View style={styles.row}>
        <Input
          key={generation}
          autoFocus={input.autoFocus}
          accessibilityLabel={props.inputAccessibilityLabel}
          value={editor.text}
          selection={placed}
          editable={props.editable}
          selectTextOnFocus={/^\s*[+−-]?0$/.test(editor.text)}
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
            if (mine !== current.current) return;
            if (placed) setPlaced(undefined);
            emit(withNativeText(latest.current, text));
          }}
          onSelectionChange={({ nativeEvent: { selection } }) => {
            if (mine !== current.current) return;
            caret.current = { start: selection.start, end: selection.end };
            if (placed) setPlaced(undefined);
          }}
          style={[props.label ? [shared.fieldInput, styles.boxed, refused && shared.fieldInputInvalid] : null, styles.input, props.inputStyle]}
        />
        {props.sign && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("amount.signA11y")}
            accessibilityState={{ disabled: !props.editable || props.sign.disabled === true }}
            disabled={!props.editable || props.sign.disabled === true}
            onPress={() => {
              const before = latest.current.editor.text;
              const next = toggleAmountSign(latest.current);
              const fromEnd = before.length - caret.current.end;
              press(next, Math.max(1, next.editor.text.length - fromEnd));
            }}
            style={({ pressed }) => [styles.key, (!props.editable || props.sign?.disabled) && styles.keyDisabled, pressed && styles.pressed]}
          >
            <Text style={styles.keyText}>+/−</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={decimals
            ? t(decimal === "," ? "amount.decimalCommaA11y" : "amount.decimalPointA11y", { currency })
            : t("amount.noDecimalsA11y", { currency })}
          accessibilityState={{ disabled: !keyEnabled }}
          disabled={!props.editable}
          onPress={() => {
            if (!keyEnabled) return;
            const next = withDecimalMark(latest.current, caret.current.end);
            press(next.session, next.caret);
          }}
          style={({ pressed }) => [styles.key, !keyEnabled && styles.keyDisabled, pressed && styles.pressed]}
        >
          <Text style={styles.keyText}>{decimal}</Text>
        </Pressable>
      </View>
      {props.notice ? <Text style={ui.muted}>{props.notice}</Text> : null}
      {review && reviewed ? (
        <View style={styles.review} accessibilityLiveRegion="polite">
          <Text style={ui.body}>
            {review.reason === "converted" && review.previous !== null
              ? t("amount.reviewConverted", { previous: review.previous, amount: reviewed })
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
          <Text style={ui.muted} importantForAccessibility={reading ? "auto" : "no-hide-descendants"}
            accessibilityElementsHidden={!reading}>{reading ? t("amount.reading", { amount: reading }) : "\u00a0"}</Text>
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
    boxed: { width: "auto" },
    review: { gap: spacing.sm, paddingVertical: spacing.xs },
    key: {
      minWidth: touchTarget,
      minHeight: touchTarget,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    keyDisabled: { opacity: 0.4 },
    pressed: { opacity: 0.7 },
    keyText: { fontFamily: font.bold, fontSize: fontSize.body, color: theme.foreground },
  });
}
