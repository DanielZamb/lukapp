import type { Theme } from "../../ui/tokens";
import type { Shown } from "../confirmation";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  type BottomSheetModal,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useMemo, useState, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { PickerSheet, usePickerSheetStyles } from "../../ui/PickerSheet";
import { Choice, Field, PrimaryButton, SecondaryButton, useTheme, useThemeMode, useUi } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { useT } from "../../i18n";
import { categoryColor, categoryOutline, categoryPalette, emojiFrom, isCustomColor, parseHexColor, quickEmojis, readableOn } from "./appearance";
import { colorDraft, CustomColorPicker, type ColorDraft } from "./CustomColorPicker";
import { NatureQuestion } from "./NatureQuestion";
import { natureLabel, type NatureAnswer, type CategoryEditor, type CategoryOption, type CategoryStyle, type EditableCategory } from "./model";

export type CategorySheetProps = {
  sheetRef: RefObject<BottomSheetModal | null>;
  search: string;
  options: CategoryOption[] | undefined;
  editor: CategoryEditor | EditableCategory | null;
  busy: boolean;
  error: string;
  canConfirm: boolean;
  answer: NatureAnswer | null;
  suggested: NatureAnswer | null;
  allowed: NatureAnswer[];
  onAnswer: (answer: NatureAnswer) => void;
  onSearch: (value: string) => void;
  onSelect: (key: string) => void;
  onCreate: () => void;
  onName: (name: string) => void;
  onStyle: (style: CategoryStyle) => void;
  onConfirm: () => void;
  onDismiss: () => void;
  selectionCount?: number;
  limitReached?: boolean;
  replacingSelection?: boolean;
  primaryOptions?: CategoryOption[];
  primaryId?: string | null;
  onPrimary?: (id: string) => void;
  onDone?: () => void;
  onCreateEncompassing?: () => void;
  /** Asks to delete the category; it never deletes. */
  onDelete?: () => void;
  /** The deletion awaiting confirmation, as the sheet shows it. */
  deleting?: Shown<DeletionView> | null;
  /** Confirms the deletion the sheet showed. */
  onConfirmDelete?: (shown: Shown<DeletionView>) => void;
  onCancelDelete?: () => void;
};
/** The category a delete confirmation shows. */
export type DeletionView = Readonly<{ categoryId: string; name: string }>;

function DeleteConfirmation({ deleting, busy, onConfirmDelete, onCancelDelete }:
  Pick<CategorySheetProps, "busy" | "onConfirmDelete" | "onCancelDelete"> & { deleting: Shown<DeletionView> }) {
  const ui = useUi();
  const { t } = useT();
  return <>
    <Text style={ui.title}>{t("categories.deleteTitle", { name: deleting.snapshot.name })}</Text>
    <Text style={ui.muted}>{t("categories.deleteBody")}</Text>
    <SecondaryButton label={t("categories.keepCategory")} disabled={busy} onPress={() => onCancelDelete?.()} />
    <SecondaryButton label={t("categories.confirmDelete")} tone="danger" disabled={busy} onPress={() => onConfirmDelete?.(deleting)} />
  </>;
}

function CategoryAppearance({ editor, ...props }: CategorySheetProps & { editor: NonNullable<CategorySheetProps["editor"]> }) {
  const mode = useThemeMode();
  const pickerSheetStyles = usePickerSheetStyles();
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useT();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<ColorDraft | null>(null);
  const committed = categoryColor(editor.style, mode);
  const color = (customDraft && parseHexColor(customDraft.text)) ?? committed;
  const outline = categoryOutline(color, mode);
  const custom = isCustomColor(editor.style.color) ? editor.style.color : null;
  const customLabel = custom ? t("lifecycle.customColorValue", { hex: custom }) : t("lifecycle.customColor");
  const name = editor.kind === "custom" || editor.kind === "edit"
    ? editor.name.trim() || t("categories.yourOwn")
    : editor.kind === "preset" ? editor.preset.name : editor.option.name;
  return (
    <View style={styles.editor}>
      <View style={styles.previewRow}>
        <View style={[styles.preview, { backgroundColor: `${color}24`, borderColor: outline }]}>
          <Text style={styles.previewEmoji}>{editor.style.emoji}</Text>
          <Text style={styles.previewName}>{name}</Text>
        </View>
      </View>
      {(editor.kind === "custom" || editor.kind === "edit") && (
        <Field
          label={t("categories.nameLabel")}
          InputComponent={BottomSheetTextInput}
          accessibilityLabel={t("categories.nameLabel")}
          value={editor.name}
          onChangeText={props.onName}
          editable={!props.busy}
          maxLength={80}
          placeholder={t("categories.namePlaceholder")}
          placeholderTextColor={theme.mutedForeground}
          style={[ui.input, pickerSheetStyles.input]}
          autoFocus
        />
      )}
      {editor.kind === "custom" && <NatureQuestion answer={props.answer} suggested={props.suggested}
        allowed={props.allowed} disabled={props.busy} onAnswer={props.onAnswer} />}
      {editor.kind === "edit" && <Text style={ui.muted}>
        {t("categories.editNatureNote", { nature: t(natureLabel(editor.category.nature)) })}
      </Text>}
      <View style={styles.emojis}>
        {quickEmojis.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityRole="radio"
            accessibilityLabel={t("categories.emojiA11y", { emoji })}
            accessibilityState={{ selected: editor.style.emoji === emoji, disabled: props.busy }}
            disabled={props.busy}
            onPress={() => props.onStyle({ ...editor.style, emoji })}
            style={[styles.emojiCell, editor.style.emoji === emoji && {
              backgroundColor: `${color}24`, borderColor: outline, borderWidth: 2,
            }]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
        {keyboardOpen ? (
          <BottomSheetTextInput
            accessibilityLabel={t("categories.typeEmoji")}
            autoFocus
            editable={!props.busy}
            value=""
            onChangeText={(text) => {
              const emoji = emojiFrom(text);
              if (emoji) {
                props.onStyle({ ...editor.style, emoji });
                setKeyboardOpen(false);
              }
            }}
            onBlur={() => setKeyboardOpen(false)}
            style={[styles.emojiCell, styles.emojiInput, { borderColor: outline, borderWidth: 2 }]}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("categories.pickEmojiA11y")}
            disabled={props.busy}
            onPress={() => setKeyboardOpen(true)}
            style={[styles.emojiCell, styles.dashed]}
          >
            <Ionicons name="add" size={22} color={theme.foreground} />
          </Pressable>
        )}
      </View>
      {keyboardOpen && <Text style={ui.muted}>{t("categories.pickEmojiHint")}</Text>}
      {customDraft ? <CustomColorPicker draft={customDraft} onDraft={setCustomDraft} onCancel={() => setCustomDraft(null)}
        onUse={(hex) => { props.onStyle({ ...editor.style, color: hex }); setCustomDraft(null); }} /> : <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.swatches}>
        {categoryPalette.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="radio"
            accessibilityLabel={t("categories.colorA11y", { id: entry.id })}
            accessibilityState={{ selected: editor.style.color === entry.id, disabled: props.busy }}
            disabled={props.busy}
            onPress={() => props.onStyle({ ...editor.style, color: entry.id })}
            style={[styles.swatch, editor.style.color === entry.id && { borderColor: entry[mode] }]}
          >
            <View style={[styles.swatchDot, { backgroundColor: entry[mode] }]} />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel={customLabel}
        accessibilityState={{ selected: !!custom, disabled: props.busy }} disabled={props.busy}
        onPress={() => setCustomDraft(colorDraft(committed))}
        style={[styles.customRow, custom && { borderColor: categoryOutline(custom, mode), borderWidth: 2 }]}>
        <View style={[styles.customDot, custom ? { backgroundColor: custom, borderColor: categoryOutline(custom, mode) } : styles.dashed]}>
          <Ionicons name={custom ? "checkmark" : "color-palette-outline"} size={18} color={custom ? readableOn(custom) : theme.foreground} />
        </View>
        <Text style={styles.customLabel}>{customLabel}</Text>
        <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
      </Pressable>
      {props.replacingSelection && (
        <Text style={ui.muted}>{t("categories.replacingSelection")}</Text>
      )}
      <PrimaryButton
        label={props.busy ? t("categories.saving") : editor.kind === "edit" ? t("categories.saveChanges") : editor.kind === "restyle" ? t("common.done")
          : props.answer === "stillMine" || props.answer === "payDebt" ? t("categories.choosePlace") : t("categories.addCategory")}
        disabled={!props.canConfirm || props.busy}
        onPress={props.onConfirm}
      />
      {editor.kind === "edit" && props.onDelete && <View style={ui.section}>
        {props.deleting ? <DeleteConfirmation {...props} deleting={props.deleting} /> : (
          <SecondaryButton label={t("categories.deleteCategory")} tone="danger" disabled={props.busy} onPress={props.onDelete} />
        )}
      </View>}
      </>}
    </View>
  );
}

export function CategorySheet(props: CategorySheetProps) {
  const mode = useThemeMode();
  const pickerSheetStyles = usePickerSheetStyles();
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useT();
  return (
    <PickerSheet
      sheetRef={props.sheetRef}
      busy={props.busy}
      stickyHeader={!props.editor}
      onDismiss={props.onDismiss}
    >
      {props.editor ? (
        <CategoryAppearance {...props} editor={props.editor} />
      ) : (
        <View style={pickerSheetStyles.search}>
          <Text style={pickerSheetStyles.title}>{t("categories.pickerTitle")}</Text>
          <BottomSheetTextInput
            accessibilityLabel={t("categories.searchLabel")}
            placeholder={t("categories.searchPlaceholder")}
            placeholderTextColor={theme.mutedForeground}
            value={props.search}
            onChangeText={props.onSearch}
            style={[ui.input, pickerSheetStyles.input]}
          />
        </View>
      )}
      {!props.editor && (
        <>
          {props.options === undefined ? (
            <Text style={ui.muted}>{t("categories.loadingList")}</Text>
          ) : props.options.length ? props.options.map((option) => {
            const color = categoryColor(option.style, mode);
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={option.name}
                accessibilityState={{ selected: option.selected }}
                style={pickerSheetStyles.row}
                onPress={() => props.onSelect(option.key)}
              >
                <View style={[styles.disc, { backgroundColor: `${color}2e`, borderColor: categoryOutline(color, mode) }]}>
                  <Text style={styles.emoji}>{option.style.emoji}</Text>
                </View>
                <Text style={[ui.body, pickerSheetStyles.rowName]}>{option.name}</Text>
                {option.selected && <Ionicons name="checkmark" size={20} color={theme.primary} />}
              </Pressable>
            );
          }) : (
            <Text style={ui.muted}>
              {props.search.trim() ? t("categories.pickerNoMatch", { query: props.search.trim() }) : t("categories.pickerEmpty")}
            </Text>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={t("categories.addOwn")} onPress={props.onCreate} style={pickerSheetStyles.row}>
            <View style={[styles.disc, styles.addDisc, styles.dashed]}>
              <Ionicons name="add" size={20} color={theme.foreground} />
            </View>
            <Text style={[ui.body, pickerSheetStyles.rowName]}>{t("categories.addOwn")}</Text>
          </Pressable>
          {props.selectionCount !== undefined && (
            <Text style={ui.muted}>{t("categories.selectionCount", { count: props.selectionCount })}</Text>
          )}
          {props.primaryOptions && (
            <View style={ui.section}>
              <Text style={ui.title}>{t("categories.primaryTitle")}</Text>
              <Text style={ui.muted}>{t("categories.primaryBody")}</Text>
              {props.primaryOptions.map((option) => (
                <Choice key={option.key} label={option.name}
                  selected={props.primaryId === option.key}
                  onPress={() => props.onPrimary?.(option.key)} />
              ))}
            </View>
          )}
          {props.limitReached && (
            <View style={ui.section}>
              <Text accessibilityRole="alert" style={ui.error}>{t("categories.limitReached")}</Text>
              <SecondaryButton label={t("categories.createEncompassing")} onPress={() => props.onCreateEncompassing?.()} />
            </View>
          )}
          {props.onDone && (
            <PrimaryButton label={t("common.done")} onPress={props.onDone} disabled={!!props.primaryOptions && !props.primaryId} />
          )}
        </>
      )}
      {!!props.error && <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text>}
    </PickerSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    disc: { width: touchTarget, height: touchTarget, borderRadius: radius.full, borderWidth: 2, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    addDisc: { borderWidth: 1, backgroundColor: theme.secondary },
    dashed: { borderStyle: "dashed" },
    emoji: { fontSize: 22 },
    editor: { gap: spacing.lg, paddingTop: spacing.sm },
    previewRow: { flexDirection: "row" },
    previewEmoji: { fontSize: 17 },
    previewName: { flexShrink: 1, color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    preview: { maxWidth: "100%", minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 2 },
    emojis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    emojiCell: { width: touchTarget, height: touchTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary },
    emojiInput: { color: theme.foreground, fontSize: 22, textAlign: "center", padding: 0 },
    swatches: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.lg },
    swatch: { width: touchTarget, height: touchTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.full, borderWidth: 2, borderColor: "transparent" },
    swatchDot: { width: 26, height: 26, borderRadius: radius.full },
    customRow: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary },
    customDot: { width: 30, height: 30, borderRadius: radius.full, borderWidth: 1, borderColor: theme.ring, alignItems: "center", justifyContent: "center" },
    customLabel: { flex: 1, minWidth: 0, color: theme.foreground, fontSize: 16, lineHeight: 22, fontFamily: font.semibold },
  });
}
