import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Choice,
  Header,
  PrimaryButton,
  SecondaryButton,
  theme,
  ui,
} from "../../ui/core";
import { radius, spacing, touchTarget } from "../../ui/tokens";
import type {
  CategoryEditor,
  CategoryOption,
  CategoryPreset,
  CategoryStyle,
  NatureAnswer,
} from "./model";

const natureLabels: Record<NatureAnswer, string> = {
  spend: "I spend it, it's gone",
  receive: "I receive it",
  stillMine: "I put it aside, it's still mine",
  payDebt: "I'm paying off something I owe",
};
export type CategorySheetProps = {
  sheetRef: RefObject<BottomSheetModal | null>;
  search: string;
  options: CategoryOption[] | undefined;
  presets: CategoryPreset[] | undefined;
  editor: CategoryEditor | null;
  allowedAnswers: NatureAnswer[];
  effectiveAnswer: NatureAnswer | null;
  busy: boolean;
  error: string;
  canConfirm: boolean;
  onSearch: (value: string) => void;
  onSelect: (key: string) => void;
  onRestyle: (key: string) => void;
  onPreset: (preset: CategoryPreset) => void;
  onCreate: () => void;
  onName: (name: string) => void;
  onAnswer: (answer: NatureAnswer) => void;
  onStyle: (style: CategoryStyle) => void;
  onConfirm: () => void;
  onBack: () => void;
  onNone?: () => void;
  onDismiss: () => void;
};

export function CategorySheet(props: CategorySheetProps) {
  const editor = props.editor;
  const door =
    editor?.kind === "custom" &&
    (props.effectiveAnswer === "stillMine" ||
      props.effectiveAnswer === "payDebt");
  return (
    <BottomSheetModal
      ref={props.sheetRef}
      snapPoints={["92%"]}
      enableDynamicSizing={false}
      enablePanDownToClose={!props.busy}
      enableContentPanningGesture={!props.busy}
      backgroundStyle={{ backgroundColor: theme.background }}
      onDismiss={props.onDismiss}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xxl, gap: spacing.xl }}
      >
        <Header
          title={
            editor
              ? editor.kind === "restyle"
                ? "Restyle category"
                : "Make it yours"
              : "Category"
          }
          onBack={editor && !props.busy ? props.onBack : undefined}
        />
        {editor ? (
          <>
            {editor.kind === "custom" ? (
              <>
                <Text style={ui.label}>CATEGORY NAME</Text>
                <BottomSheetTextInput
                  accessibilityLabel="Category name"
                  value={editor.name}
                  onChangeText={props.onName}
                  editable={!props.busy}
                  maxLength={80}
                  placeholder="Add your own"
                  placeholderTextColor={theme.mutedForeground}
                  style={ui.input}
                />
                <Text style={ui.title}>What happens to the money?</Text>
                {props.allowedAnswers.map((answer) => (
                  <Choice
                    key={answer}
                    label={natureLabels[answer]}
                    selected={props.effectiveAnswer === answer}
                    onPress={() => !props.busy && props.onAnswer(answer)}
                  />
                ))}
              </>
            ) : (
              <Text style={ui.title}>
                {editor.kind === "preset"
                  ? editor.preset.name
                  : editor.option.name}
              </Text>
            )}
            {door ? (
              <View style={ui.section}>
                <Text style={ui.body}>
                  This is a place money lives. It needs its own place to track
                  what you hold or owe.
                </Text>
                {props.effectiveAnswer === "payDebt" && (
                  <Text style={ui.body}>
                    When you add it, we'll ask: How much do you still owe?
                  </Text>
                )}
                <Text style={ui.muted}>
                  Adding a place is not available here yet. Your expense stays
                  unchanged.
                </Text>
                <SecondaryButton
                  label="Back to categories"
                  onPress={props.onBack}
                />
              </View>
            ) : (
              <>
                <Text style={ui.label}>ICON</Text>
                <View style={styles.chips}>
                  {[
                    "🏷️",
                    "🛒",
                    "🍽️",
                    "🏠",
                    "🚌",
                    "💊",
                    "🎓",
                    "🎬",
                    "🐾",
                    "💼",
                  ].map((emoji) => (
                    <Pressable
                      key={emoji}
                      accessibilityRole="radio"
                      accessibilityLabel={`Icon ${emoji}`}
                      accessibilityState={{
                        checked: editor.style.emoji === emoji,
                        disabled: props.busy,
                      }}
                      disabled={props.busy}
                      onPress={() => props.onStyle({ ...editor.style, emoji })}
                      style={[
                        styles.chip,
                        {
                          borderColor:
                            editor.style.emoji === emoji
                              ? theme.primary
                              : theme.border,
                        },
                      ]}
                    >
                      <Text style={ui.body}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={ui.label}>COLOR</Text>
                <View style={styles.chips}>
                  {(["primary", "positive", "warning"] as const).map(
                    (tone, index) => (
                      <Pressable
                        key={tone}
                        accessibilityRole="radio"
                        accessibilityLabel={["Purple", "Green", "Amber"][index]}
                        accessibilityState={{
                          checked: editor.style.tone === tone,
                          disabled: props.busy,
                        }}
                        disabled={props.busy}
                        onPress={() => props.onStyle({ ...editor.style, tone })}
                        style={[
                          styles.chip,
                          {
                            borderColor:
                              editor.style.tone === tone
                                ? theme.foreground
                                : theme.border,
                          },
                        ]}
                      >
                        <View
                          style={[styles.dot, { backgroundColor: theme[tone] }]}
                        />
                      </Pressable>
                    ),
                  )}
                </View>
                <PrimaryButton
                  label={
                    props.busy
                      ? "Saving…"
                      : editor.kind === "restyle"
                        ? "Save style"
                        : "Add category"
                  }
                  disabled={!props.canConfirm || props.busy}
                  onPress={props.onConfirm}
                />
              </>
            )}
          </>
        ) : (
          <>
            <BottomSheetTextInput
              accessibilityLabel="Search categories"
              placeholder="Search categories"
              placeholderTextColor={theme.mutedForeground}
              value={props.search}
              onChangeText={props.onSearch}
              style={ui.input}
            />
            {props.onNone && (
              <SecondaryButton label="No category" onPress={props.onNone} />
            )}
            <Text style={ui.label}>YOUR CATEGORIES</Text>
            {props.options === undefined ? (
              <Text style={ui.muted}>Loading categories…</Text>
            ) : props.options.length ? (
              props.options.map((option) => (
                <View key={option.key} style={styles.option}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: option.selected }}
                    style={styles.select}
                    onPress={() => props.onSelect(option.key)}
                  >
                    <Text
                      style={[ui.body, { color: theme[option.style.tone] }]}
                    >
                      {option.style.emoji} {option.name}
                      {option.selected ? " ✓" : ""}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Restyle ${option.name}`}
                    onPress={() => props.onRestyle(option.key)}
                    style={styles.chip}
                  >
                    <Text style={ui.muted}>Edit style</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={ui.muted}>No matching categories.</Text>
            )}
            <Text style={ui.label}>SUGGESTIONS</Text>
            {props.presets === undefined ? (
              <Text style={ui.muted}>Loading suggestions…</Text>
            ) : (
              props.presets.map((preset) => (
                <SecondaryButton
                  key={preset.id}
                  label={preset.name}
                  onPress={() => props.onPreset(preset)}
                />
              ))
            )}
            <PrimaryButton label="Add your own" onPress={props.onCreate} />
          </>
        )}
        {!!props.error && (
          <Text accessibilityRole="alert" style={ui.error}>
            {props.error}
          </Text>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    padding: spacing.md,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: spacing.xl, height: spacing.xl, borderRadius: radius.full },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  select: { flex: 1, minHeight: touchTarget, justifyContent: "center" },
});
