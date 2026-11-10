import { useMemo, useRef, type ComponentProps, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from "react-native";
import { useT } from "../../i18n";
import { useThemeContext } from "../../ui/themeContext";
import { font, fontSize, radius, spacing, touchTarget, type Theme } from "../../ui/tokens";
import { formatMoney } from "../money";
import { amountHint } from "./hints";
import { nativeSelectionChange, nativeTextChange, nativeTrackOf } from "./nativeEdit";
import { confirmAmount, editAmountSession, toggleAmountSign, type AmountSession } from "./session";

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
 * same session, offers the workspace's decimal mark as a key of its own, explains refused input, and asks the person
 * to confirm an amount the app rewrote or that arrived pasted with a separator.
 */
export function AmountField(props: AmountFieldProps) {
  const { t } = useT();
  const { theme, ui, styles: shared } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const latest = useRef(props.session);
  latest.current = props.session;
  const track = useRef(nativeTrackOf(props.session));
  const { editor, currency, review } = props.session;
  const { decimal } = editor.format.convention;
  const decimals = editor.format.precision > 0;
  const hint = amountHint(props.session, t);
  const Input = props.InputComponent ?? TextInput;
  function emit(next: AmountSession) {
    if (next === latest.current) return;
    latest.current = next;
    props.onChange(next);
  }
  /** A press of the field's own keys comes after every report the last native edit could still send. */
  function press(next: AmountSession) {
    track.current = nativeTrackOf(next, track.current.order);
    emit(next);
  }
  const keyEnabled = props.editable && decimals;
  const refused = !!hint || !!props.message?.error;
  const reviewed = review ? formatMoney({ currency, minorUnits: review.minorUnits }) : null;
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
            const next = nativeTextChange(latest.current, track.current, text);
            track.current = next.track;
            emit(next.session);
          }}
          onSelectionChange={({ nativeEvent: { selection } }) => {
            const next = nativeSelectionChange(latest.current, track.current, selection);
            track.current = next.track;
            emit(next.session);
          }}
          style={[props.label ? [shared.fieldInput, styles.boxed, refused && shared.fieldInputInvalid] : null, styles.input, props.inputStyle]}
        />
        {props.sign && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("amount.signA11y")}
            accessibilityState={{ disabled: !props.editable || props.sign.disabled === true }}
            disabled={!props.editable || props.sign.disabled === true}
            onPress={() => press(toggleAmountSign(latest.current))}
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
          onPress={() => press(editAmountSession(latest.current, { kind: "decimal" }))}
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
            onPress={() => press(confirmAmount(latest.current))}
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
