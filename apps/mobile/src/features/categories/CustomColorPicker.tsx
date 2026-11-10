import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useEffect, useMemo, useRef } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useT, type MessageKey } from "../../i18n";
import { usePickerSheetStyles } from "../../ui/PickerSheet";
import { Field, PrimaryButton, SecondaryButton, useTheme, useThemeMode, useUi } from "../../ui/core";
import { radius, spacing, touchTarget, type Theme } from "../../ui/tokens";
import { categoryOutline, hexToHsl, hslToHex, parseHexColor, readableOn, type Hsl } from "./appearance";

/** The typed text is what gets saved; the HSL tracks the last valid colour so the strips stay usable mid-typing. */
export type ColorDraft = Hsl & { text: string };

export function colorDraft(hex: string): ColorDraft {
  const text = hex.toUpperCase();
  return { text, ...hexToHsl(text) };
}

const hues = Array.from({ length: 24 }, (_, index) => index * 15);
const saturations = [0, 25, 50, 75, 100];
const lightnesses = [10, 20, 30, 40, 50, 60, 70, 80, 90];

type Strip = { key: keyof Hsl; label: MessageKey; a11y: MessageKey; param: "degrees" | "percent"; steps: number[];
  swatch: (draft: ColorDraft, step: number) => string };
const strips: Strip[] = [
  { key: "hue", label: "lifecycle.hue", a11y: "lifecycle.hueA11y", param: "degrees", steps: hues,
    swatch: (_, hue) => hslToHex({ hue, saturation: 70, lightness: 50 }) },
  { key: "saturation", label: "lifecycle.saturation", a11y: "lifecycle.saturationA11y", param: "percent", steps: saturations,
    swatch: (draft, saturation) => hslToHex({ ...draft, saturation }) },
  { key: "lightness", label: "lifecycle.lightness", a11y: "lifecycle.lightnessA11y", param: "percent", steps: lightnesses,
    swatch: (draft, lightness) => hslToHex({ ...draft, lightness }) },
];

export function CustomColorPicker({ draft, onDraft, onUse, onCancel }: {
  draft: ColorDraft;
  onDraft: (draft: ColorDraft) => void;
  onUse: (hex: string) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const ui = useUi();
  const theme = useTheme();
  const mode = useThemeMode();
  const pickerSheetStyles = usePickerSheetStyles();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      cancel.current();
      return true;
    });
    return () => subscription.remove();
  }, []);
  const hex = parseHexColor(draft.text);
  const pick = (key: keyof Hsl, step: number) => {
    const next = { ...draft, [key]: step };
    onDraft({ ...next, text: hslToHex(next).toUpperCase() });
  };
  return (
    <View style={styles.picker}>
      <Text accessibilityRole="header" style={ui.title}>{t("lifecycle.customColorTitle")}</Text>
      {strips.map((strip) => {
        const cells = strip.steps.map((step) => {
          const color = strip.swatch(draft, step);
          const selected = draft[strip.key] === step;
          return (
            <Pressable key={step} accessibilityRole="radio"
              accessibilityLabel={t(strip.a11y, { [strip.param]: step })}
              accessibilityState={{ selected }}
              onPress={() => pick(strip.key, step)}
              style={[styles.cell, selected && { borderColor: theme.foreground }]}>
              <View style={[styles.dot, { backgroundColor: color, borderColor: categoryOutline(color, mode) }]}>
                {selected && <Ionicons name="checkmark" size={18} color={readableOn(color)} />}
              </View>
            </Pressable>
          );
        });
        return (
          <View key={strip.key} style={styles.strip}>
            <Text style={ui.label}>{t(strip.label).toUpperCase()}</Text>
            {strip.key === "hue"
              ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                accessibilityRole="radiogroup" accessibilityLabel={t(strip.label)} contentContainerStyle={styles.row}>{cells}</ScrollView>
              : <View accessibilityRole="radiogroup" accessibilityLabel={t(strip.label)} style={[styles.row, styles.wrap]}>{cells}</View>}
          </View>
        );
      })}
      <Field label={t("lifecycle.hexLabel")} InputComponent={BottomSheetTextInput}
        accessibilityLabel={t("lifecycle.hexA11y")} value={draft.text} maxLength={7}
        autoCapitalize="characters" autoCorrect={false} spellCheck={false}
        helperText={t("lifecycle.hexHint")} error={hex ? undefined : t("lifecycle.hexInvalid")}
        onChangeText={(text) => {
          const parsed = parseHexColor(text);
          onDraft(parsed ? { ...hexToHsl(parsed), text } : { ...draft, text });
        }}
        style={[ui.input, pickerSheetStyles.input]} />
      <PrimaryButton label={t("lifecycle.useColor")} trailingIcon="checkmark" disabled={!hex}
        onPress={() => { if (hex) onUse(hex); }} />
      <SecondaryButton label={t("common.cancel")} onPress={onCancel} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    picker: { gap: spacing.lg },
    strip: { gap: spacing.sm },
    row: { flexDirection: "row", gap: spacing.xs, paddingRight: spacing.lg },
    wrap: { flexWrap: "wrap", paddingRight: 0 },
    cell: { width: touchTarget, height: touchTarget, alignItems: "center", justifyContent: "center",
      borderRadius: radius.full, borderWidth: 2, borderColor: "transparent" },
    dot: { width: 34, height: 34, borderRadius: radius.full, borderWidth: 1, alignItems: "center", justifyContent: "center",
      backgroundColor: theme.secondary },
  });
}
