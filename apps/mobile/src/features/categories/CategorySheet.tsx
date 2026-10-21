import type { Theme } from "../../ui/tokens";
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
import { categoryColor, categoryPalette, emojiFrom, quickEmojis } from "./appearance";
import { NatureQuestion } from "./NatureQuestion";
import type { NatureAnswer, CategoryEditor, CategoryOption, CategoryStyle, EditableCategory } from "./model";

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
  onDelete?: () => void;
  confirmingDelete?: boolean;
  onCancelDelete?: () => void;
};

function CategoryAppearance({ editor, ...props }: CategorySheetProps & { editor: NonNullable<CategorySheetProps["editor"]> }) {
  const mode = useThemeMode();
  const pickerSheetStyles = usePickerSheetStyles();
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const color = categoryColor(editor.style, mode);
  const name = editor.kind === "custom" || editor.kind === "edit"
    ? editor.name.trim() || "Your own"
    : editor.kind === "preset" ? editor.preset.name : editor.option.name;
  return (
    <View style={styles.editor}>
      <View style={styles.previewRow}>
        <View style={[styles.preview, { backgroundColor: `${color}24`, borderColor: color }]}>
          <Text style={styles.previewEmoji}>{editor.style.emoji}</Text>
          <Text style={styles.previewName}>{name}</Text>
        </View>
      </View>
      {(editor.kind === "custom" || editor.kind === "edit") && (
        <Field
          label="Category name"
          InputComponent={BottomSheetTextInput}
          accessibilityLabel="Category name"
          value={editor.name}
          onChangeText={props.onName}
          editable={!props.busy}
          maxLength={80}
          placeholder="Name it your way"
          placeholderTextColor={theme.mutedForeground}
          style={[ui.input, pickerSheetStyles.input]}
          autoFocus
        />
      )}
      {editor.kind === "custom" && <NatureQuestion answer={props.answer} suggested={props.suggested}
        allowed={props.allowed} disabled={props.busy} onAnswer={props.onAnswer} />}
      {editor.kind === "edit" && <Text style={ui.muted}>
        {editor.category.nature === "Income" ? "Money in" : editor.category.nature === "Expense" ? "Money out" : "Money direction not set"}. Changing the name or look keeps the same money direction.
      </Text>}
      <View style={styles.emojis}>
        {quickEmojis.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityRole="radio"
            accessibilityLabel={`Emoji ${emoji}`}
            accessibilityState={{ selected: editor.style.emoji === emoji, disabled: props.busy }}
            disabled={props.busy}
            onPress={() => props.onStyle({ ...editor.style, emoji })}
            style={[styles.emojiCell, editor.style.emoji === emoji && {
              backgroundColor: `${color}24`, borderColor: color, borderWidth: 2,
            }]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
        {keyboardOpen ? (
          <BottomSheetTextInput
            accessibilityLabel="Type any emoji"
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
            style={[styles.emojiCell, styles.emojiInput, { borderColor: color, borderWidth: 2 }]}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick any emoji from your keyboard"
            disabled={props.busy}
            onPress={() => setKeyboardOpen(true)}
            style={[styles.emojiCell, styles.dashed]}
          >
            <Ionicons name="add" size={22} color={theme.foreground} />
          </Pressable>
        )}
      </View>
      {keyboardOpen && <Text style={ui.muted}>Pick an emoji from your phone keyboard.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.swatches}>
        {categoryPalette.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="radio"
            accessibilityLabel={`Color ${entry.id}`}
            accessibilityState={{ selected: editor.style.color === entry.id, disabled: props.busy }}
            disabled={props.busy}
            onPress={() => props.onStyle({ ...editor.style, color: entry.id })}
            style={[styles.swatch, editor.style.color === entry.id && { borderColor: entry[mode] }]}
          >
            <View style={[styles.swatchDot, { backgroundColor: entry[mode] }]} />
          </Pressable>
        ))}
      </ScrollView>
      {props.replacingSelection && (
        <Text style={ui.muted}>This category will replace the three selected categories.</Text>
      )}
      <PrimaryButton
        label={props.busy ? "Saving…" : editor.kind === "edit" ? "Save changes" : editor.kind === "restyle" ? "Done"
          : props.answer === "stillMine" || props.answer === "payDebt" ? "Choose a place" : "Add category"}
        disabled={!props.canConfirm || props.busy}
        onPress={props.onConfirm}
      />
      {editor.kind === "edit" && props.onDelete && <View style={ui.section}>
        {props.confirmingDelete && <>
          <Text style={ui.title}>Delete {editor.category.name}?</Text>
          <Text style={ui.muted}>It will no longer appear when choosing categories. Existing entries and their amounts stay in your history.</Text>
          <SecondaryButton label="Keep category" disabled={props.busy} onPress={() => props.onCancelDelete?.()} />
        </>}
        <SecondaryButton label={props.confirmingDelete ? "Confirm delete" : "Delete category"} tone="danger"
          disabled={props.busy} onPress={props.onDelete} />
      </View>}
    </View>
  );
}

export function CategorySheet(props: CategorySheetProps) {
  const mode = useThemeMode();
  const pickerSheetStyles = usePickerSheetStyles();
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
          <Text style={pickerSheetStyles.title}>Category</Text>
          <BottomSheetTextInput
            accessibilityLabel="Search categories"
            placeholder="Search"
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
            <Text style={ui.muted}>Loading categories…</Text>
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
                <View style={[styles.disc, { backgroundColor: `${color}2e`, borderColor: color }]}>
                  <Text style={styles.emoji}>{option.style.emoji}</Text>
                </View>
                <Text style={[ui.body, pickerSheetStyles.rowName]}>{option.name}</Text>
                {option.selected && <Ionicons name="checkmark" size={20} color={theme.primary} />}
              </Pressable>
            );
          }) : (
            <Text style={ui.muted}>
              {props.search.trim() ? `Nothing matches "${props.search.trim()}".` : "No categories yet."}
            </Text>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Add your own" onPress={props.onCreate} style={pickerSheetStyles.row}>
            <View style={[styles.disc, styles.addDisc, styles.dashed]}>
              <Ionicons name="add" size={20} color={theme.foreground} />
            </View>
            <Text style={[ui.body, pickerSheetStyles.rowName]}>Add your own</Text>
          </Pressable>
          {props.selectionCount !== undefined && (
            <Text style={ui.muted}>{props.selectionCount} of 3 selected. Each counts the full amount.</Text>
          )}
          {props.primaryOptions && (
            <View style={ui.section}>
              <Text style={ui.title}>Which category is primary?</Text>
              <Text style={ui.muted}>Choose which best describes this expense. Each selected category still counts the full amount.</Text>
              {props.primaryOptions.map((option) => (
                <Choice key={option.key} label={option.name}
                  selected={props.primaryId === option.key}
                  onPress={() => props.onPrimary?.(option.key)} />
              ))}
            </View>
          )}
          {props.limitReached && (
            <View style={ui.section}>
              <Text accessibilityRole="alert" style={ui.error}>Choose up to three categories. Remove one, or create a category that encompasses the concept.</Text>
              <SecondaryButton label="Create an encompassing category" onPress={() => props.onCreateEncompassing?.()} />
            </View>
          )}
          {props.onDone && (
            <PrimaryButton label="Done" onPress={props.onDone} disabled={!!props.primaryOptions && !props.primaryId} />
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
  });
}
