import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SheetModal } from "../../ui/SheetModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Field, PrimaryButton, SecondaryButton, useTheme, useThemeMode, useUi } from "../../ui/core";
import { useT } from "../../i18n";
import { spacing, touchTarget } from "../../ui/tokens";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import type { SetupCategory } from "../setup/model";
import { SetupBackdrop } from "../setup/SearchSheet";
import { useSetupStyles } from "../setup/styles";
import { categoryColor, categoryOutline, categoryPalette } from "./appearance";
import { emojiFrom, fallbackLook, quickEmojis } from "./looks";
import { NatureQuestion } from "./NatureQuestion";
import { useNatureSuggestion } from "./useNatureSuggestion";
import { categoryNameKey, type NatureAnswer, type AccountSetupRequest } from "./model";
import { LookChip } from "./LookChip";

export type RestyleTarget =
  | { kind: "create" }
  | { kind: "edit"; category: SetupCategory };
export function RestyleSheet({
  target,
  names,
  onCommit,
  onAccountSetup,
  onClose,
  onDelete,
}: {
  target: RestyleTarget;
  names: string[];
  onCommit: (category: SetupCategory) => void;
  onClose: () => void;
  onAccountSetup: (request: AccountSetupRequest) => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();
  const mode = useThemeMode();
  const insets = useSafeAreaInsets();
  const ui = useUi();
  const { t } = useT();
  const styles = useSetupStyles();
  const sheet = useRef<BottomSheetModal>(null);
  const [name, setName] = useState(target.kind === "edit" ? target.category.name : "");
  const [style, setStyle] = useState(
    target.kind === "edit" ? target.category.style : fallbackLook,
  );
  const [override, setOverride] = useState<NatureAnswer | null>(null);
  const nature = useNatureSuggestion(target.kind === "create" ? name : "");
  const answer = override ?? nature.suggested;
  const [keyboard, setKeyboard] = useState(false);
  const interact = useLocalEntryInteraction();
  const trimmed = name.trim();
  const duplicate = names.some(
    (item) => !(target.kind === "edit" && item === target.category.name) && categoryNameKey(item) === categoryNameKey(trimmed),
  );
  const named = target.kind === "create" || target.category.source === "custom";
  const blocked = named && (!trimmed || trimmed.length > 80 || duplicate || (target.kind === "create" && !answer));
  const color = categoryColor(style, mode);
  const preview = {
    name: trimmed || t("categories.yourOwn"),
    style,
  };
  return (
    <SheetModal
      sheetRef={sheet}
      presentOnMount
      trackPresentation
      androidBack
      busy={false}
      topInset={insets.top}
      stackBehavior="push"
      enablePanDownToClose
      backdropComponent={SetupBackdrop}
      onDismiss={onClose}
      backgroundStyle={{ backgroundColor: theme.background }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
      >
        <View style={{ alignItems: "flex-start" }}>
          <LookChip category={preview} />
        </View>
        {named && (
          <Field
            label={t("categories.nameLabel")}
            InputComponent={BottomSheetTextInput}
            accessibilityLabel={t("categories.nameLabel")}
            placeholder={t("categories.namePlaceholder")}
            placeholderTextColor={theme.mutedForeground}
            autoFocus
            value={name}
            maxLength={80}
            style={styles.input}
            onChangeText={(value) => {
              interact();
              setName(value);
              setOverride(null);
            }}
          />
        )}
        {target.kind === "create" && <NatureQuestion answer={answer} suggested={nature.suggested}
          allowed={nature.allowed} disabled={false} onAnswer={(value) => { interact(); setOverride(value); }} />}
        <View style={styles.wrap}>
          {quickEmojis.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="radio"
              accessibilityLabel={t("categories.emojiA11y", { emoji })}
              accessibilityState={{ checked: style.emoji === emoji }}
              style={[
                styles.icon,
                style.emoji === emoji && {
                  borderColor: categoryOutline(color, mode),
                  borderWidth: 2,
                  backgroundColor: `${color}24`,
                },
              ]}
              onPress={() => {
                interact();
                setStyle({ ...style, emoji });
              }}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Pressable>
          ))}
          {keyboard ? (
            <BottomSheetTextInput
              accessibilityLabel={t("categories.typeEmoji")}
              autoFocus
              value=""
              style={styles.icon}
              onChangeText={(text) => {
                const emoji = emojiFrom(text);
                if (emoji) {
                  interact();
                  setStyle({ ...style, emoji });
                  setKeyboard(false);
                }
              }}
              onBlur={() => setKeyboard(false)}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("categories.pickEmojiA11y")}
              style={styles.icon}
              onPress={() => {
                interact();
                setKeyboard(true);
              }}
            >
              <Ionicons name="add" size={22} color={theme.foreground} />
            </Pressable>
          )}
        </View>
        {keyboard && (
          <Text style={ui.muted}>{t("categories.pickEmojiHint")}</Text>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {categoryPalette.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="radio"
              accessibilityLabel={t("categories.colorA11y", { id: entry.id })}
              accessibilityState={{ checked: style.color === entry.id }}
              onPress={() => {
                interact();
                setStyle({ ...style, color: entry.id });
              }}
              style={{
                width: touchTarget,
                height: touchTarget,
                borderRadius: touchTarget / 2,
                borderWidth: 2,
                borderColor:
                  style.color === entry.id ? entry[mode] : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: entry[mode],
                }}
              />
            </Pressable>
          ))}
        </ScrollView>
        <PrimaryButton
          label={target.kind === "edit" ? t("common.done") : t("categories.addCategory")}
          trailingIcon="checkmark"
          disabled={blocked}
          onPress={() => {
            if (blocked) return;
            if (target.kind === "edit") onCommit({ ...target.category, name: trimmed, style });
            else if (answer === "spend" || answer === "receive")
              onCommit({ name: trimmed, style, source: "custom", answer });
            else if (answer) onAccountSetup({ name: trimmed, style, answer });
            sheet.current?.dismiss();
          }}
        />
        {target.kind === "edit" && target.category.source === "custom" && onDelete &&
          <SecondaryButton label={t("categories.removeCategory")} tone="danger" onPress={() => { interact(); onDelete(); sheet.current?.dismiss(); }} />}
      </BottomSheetScrollView>
    </SheetModal>
  );
}
