import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { PrimaryButton, useTheme, useUi } from "../../ui/core";
import { spacing, touchTarget } from "../../ui/tokens";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import type { SetupCategory } from "../setup/model";
import { SetupBackdrop } from "../setup/SearchSheet";
import { useSetupStyles } from "../setup/styles";
import {
  categoryColor,
  categoryPalette,
  emojiFrom,
  fallbackLook,
  quickEmojis,
} from "./looks";
import { categoryNameKey } from "./model";
import { LookChip } from "./LookChip";

export type RestyleTarget =
  | { kind: "create" }
  | { kind: "edit"; category: SetupCategory };
export function RestyleSheet({
  target,
  names,
  full,
  onCommit,
  onClose,
}: {
  target: RestyleTarget;
  names: string[];
  full: boolean;
  onCommit: (category: SetupCategory) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const ui = useUi();
  const styles = useSetupStyles();
  const sheet = useRef<BottomSheetModal>(null);
  const [name, setName] = useState("");
  const [style, setStyle] = useState(
    target.kind === "edit" ? target.category.style : fallbackLook,
  );
  const [keyboard, setKeyboard] = useState(false);
  const interact = useLocalEntryInteraction();
  useEffect(() => {
    sheet.current?.present();
  }, []);
  const trimmed = name.trim();
  const duplicate = names.some(
    (item) => categoryNameKey(item) === categoryNameKey(trimmed),
  );
  const blocked = target.kind === "create" && (!trimmed || duplicate || full);
  const color = categoryColor(style) ?? theme.primary;
  const preview = {
    name: target.kind === "edit" ? target.category.name : trimmed || "Your own",
    style,
  };
  return (
    <BottomSheetModal
      ref={sheet}
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
        {target.kind === "create" && (
          <BottomSheetTextInput
            accessibilityLabel="Category name"
            placeholder="Name it your way"
            placeholderTextColor={theme.mutedForeground}
            autoFocus
            value={name}
            style={styles.input}
            onChangeText={(value) => {
              interact();
              setName(value);
            }}
          />
        )}
        <View style={styles.wrap}>
          {quickEmojis.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="radio"
              accessibilityLabel={`Emoji ${emoji}`}
              accessibilityState={{ checked: style.emoji === emoji }}
              style={[
                styles.icon,
                style.emoji === emoji && {
                  borderColor: color,
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
              accessibilityLabel="Type any emoji"
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
              accessibilityLabel="Pick any emoji from your keyboard"
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
          <Text style={ui.muted}>Pick an emoji from your phone keyboard.</Text>
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
              accessibilityLabel={`Color ${entry.id}`}
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
                  style.color === entry.id ? entry.light : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: entry.light,
                }}
              />
            </Pressable>
          ))}
        </ScrollView>
        <PrimaryButton
          label={target.kind === "edit" ? "Done" : "Add category"}
          trailingIcon="checkmark"
          disabled={blocked}
          onPress={() => {
            if (blocked) return;
            onCommit(
              target.kind === "edit"
                ? { ...target.category, style }
                : { name: trimmed, style, source: "custom" },
            );
            sheet.current?.dismiss();
          }}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
