import { useMemo, useRef, type ComponentProps, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { useT } from "../../i18n";
import { useThemeContext } from "../../ui/themeContext";
import { font, fontSize, radius, spacing, touchTarget, type Theme } from "../../ui/tokens";
import { amountHint } from "./hints";
import { applyNativeText, nativeCaretAfter } from "./nativeEdit";
import { editAmountSession, toggleAmountSign, type AmountSession } from "./session";

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
 * The one input for an amount. It turns each text and selection change from the native field into an edit of the
 * same session, offers the workspace's decimal mark as a key of its own, and explains refused input.
 */
export function AmountField(props: AmountFieldProps) {
  const { t } = useT();
  const { theme, ui, styles: shared } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const latest = useRef(props.session);
  latest.current = props.session;
  const staleCaret = useRef<number | null>(null);
  const { editor, currency } = props.session;
  const { decimal } = editor.format.convention;
  const decimals = editor.format.precision > 0;
  const hint = amountHint(props.session, t);
  const Input = props.InputComponent ?? TextInput;
  function emit(next: AmountSession) {
    latest.current = next;
    props.onChange(next);
  }
  const keyEnabled = props.editable && decimals;
  const refused = !!hint || !!props.message?.error;
  return (
    <View style={styles.field}>
      {props.label ? <Text style={shared.fieldLabel}>{props.label}</Text> : null}
      <View style={styles.row}>
        <Input
          accessibilityLabel={props.inputAccessibilityLabel}
          value={editor.text}
          selection={editor.selection}
          editable={props.editable}
          keyboardType="decimal-pad"
          autoCorrect={false}
          autoComplete="off"
          placeholder={props.placeholder}
          placeholderTextColor={theme.mutedForeground}
          cursorColor={theme.primary}
          selectionColor={theme.primary}
          onChangeText={(text) => {
            const current = latest.current;
            const caret = nativeCaretAfter(current, text);
            const next = applyNativeText(current, text);
            staleCaret.current = next.editor.selection.end === caret ? null : caret;
            emit(next);
          }}
          onSelectionChange={({ nativeEvent: { selection } }) => {
            const current = latest.current;
            const stale = staleCaret.current;
            staleCaret.current = null;
            if (stale !== null && selection.start === stale && selection.end === stale) return;
            if (selection.start > selection.end || selection.end > current.editor.text.length) return;
            if (selection.start === current.editor.selection.start && selection.end === current.editor.selection.end) return;
            emit(editAmountSession(current, { kind: "select", selection }));
          }}
          style={[props.label ? [shared.fieldInput, styles.boxed, refused && shared.fieldInputInvalid] : null, styles.input, props.inputStyle]}
        />
        {props.sign && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("amount.signA11y")}
            accessibilityState={{ disabled: !props.editable || props.sign.disabled === true }}
            disabled={!props.editable || props.sign.disabled === true}
            onPress={() => emit(toggleAmountSign(latest.current))}
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
          disabled={!keyEnabled}
          onPress={() => emit(editAmountSession(latest.current, { kind: "decimal" }))}
          style={({ pressed }) => [styles.key, !keyEnabled && styles.keyDisabled, pressed && styles.pressed]}
        >
          <Text style={styles.keyText}>{decimal}</Text>
        </Pressable>
      </View>
      {props.notice ? <Text style={ui.muted}>{props.notice}</Text> : null}
      {hint ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={ui.error}>{hint}</Text>
      ) : props.message?.error ? (
        <Text accessibilityRole="alert" style={ui.error}>{props.message.error}</Text>
      ) : props.message?.helper ? (
        <Text style={ui.muted}>{props.message.helper}</Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    field: { gap: spacing.xs },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    input: { flex: 1, minWidth: 0 },
    boxed: { width: "auto" },
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
