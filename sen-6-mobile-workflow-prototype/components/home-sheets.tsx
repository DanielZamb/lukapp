// Home sheets use the same gorhom BottomSheet setup as tx history.
// Tx creation lives in create-tx-prototype.tsx.

import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  font,
  fontSize,
  radius,
  spacing,
  touchTarget,
  type Theme,
} from "../theme/tokens";
import { SheetTextInput, renderSheetBackdrop } from "./first-time-setup";

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export const kindEmoji: Record<string, string> = {
  Checking: "💰",
  Savings: "🏦",
  Wallet: "👛",
};

export const placeEmojis = [
  "💰",
  "🏦",
  "👛",
  "💳",
  "🏠",
  "💼",
  "🪙",
  "🐷",
  "✨",
  "🚗",
];

export function ChooseActionSheet({
  theme,
  onPlace,
  onTx,
  onDismiss,
}: {
  theme: Theme;
  onPlace: () => void;
  onTx: () => void;
  onDismiss: () => void;
}) {
  const styles = createStyles(theme);
  return (
    <BottomSheet
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderSheetBackdrop}
      backgroundStyle={styles.sheetSurface}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <BottomSheetView style={styles.sheetBody}>
        <Text style={styles.sheetTitle}>What do you want to do?</Text>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onPlace}
          style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
        >
          <View style={styles.choiceCopy}>
            <Text style={styles.choiceTitle}>Create a place</Text>
            <Text style={styles.muted}>Another pocket for money</Text>
          </View>
          <Ionicons name="wallet-outline" size={22} color={theme.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onTx}
          style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
        >
          <View style={styles.choiceCopy}>
            <Text style={styles.choiceTitle}>Create a tx</Text>
            <Text style={styles.muted}>Post money</Text>
          </View>
          <Ionicons name="create-outline" size={22} color={theme.foreground} />
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
}

export function AddPlaceSheet({
  theme,
  unlocking,
  name,
  kind,
  emoji,
  balance,
  onName,
  onKind,
  onOpenEmoji,
  onBalance,
  onSave,
  onDismiss,
}: {
  theme: Theme;
  unlocking: boolean;
  name: string;
  kind: string;
  emoji: string;
  balance: string;
  onName: (value: string) => void;
  onKind: (kind: string) => void;
  onOpenEmoji: () => void;
  onBalance: (value: string) => void;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const styles = createStyles(theme);
  return (
    <BottomSheet
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderSheetBackdrop}
      snapPoints={["80%"]}
      enableDynamicSizing={false}
      backgroundStyle={styles.sheetSurface}
      handleIndicatorStyle={styles.sheetHandle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.sheetListContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>
          {unlocking ? "THIS OPENS LEVEL 1" : "ANOTHER PLACE"}
        </Text>
        <Text style={styles.sheetTitle}>Add a place</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Name you recognize</Text>
          <SheetTextInput
            accessibilityLabel="Account name"
            value={name}
            onChangeText={onName}
            placeholder="Savings"
            placeholderTextColor={theme.mutedForeground}
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.chipRow}>
            {["Checking", "Savings", "Wallet"].map((entry) => (
              <Pressable
                key={entry}
                accessibilityRole="radio"
                accessibilityState={{ selected: kind === entry }}
                onPressIn={lightTap}
                onPress={() => onKind(entry)}
                style={[styles.chip, kind === entry && styles.chipSelected]}
              >
                <Text style={styles.chipText}>{entry}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Look</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose emoji"
            onPressIn={lightTap}
            onPress={onOpenEmoji}
            style={({ pressed }) => [styles.emojiOpen, pressed && styles.pressed]}
          >
            <Text style={styles.emojiPreview}>{emoji}</Text>
            <Text style={styles.muted}>Change</Text>
          </Pressable>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Balance today</Text>
          <SheetTextInput
            accessibilityLabel="Balance today"
            value={balance}
            onChangeText={onBalance}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.mutedForeground}
            style={styles.input}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onSave}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Add this place</Text>
          <Ionicons name="checkmark" size={20} color="#f5f3ff" />
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

export function EmojiSheet({
  theme,
  emoji,
  onPick,
  onDismiss,
}: {
  theme: Theme;
  emoji: string;
  onPick: (emoji: string) => void;
  onDismiss: () => void;
}) {
  const styles = createStyles(theme);
  return (
    <BottomSheet
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderSheetBackdrop}
      backgroundStyle={styles.sheetSurface}
      handleIndicatorStyle={styles.sheetHandle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={styles.sheetBody}>
        <Text style={styles.sheetTitle}>Look</Text>
        <View style={styles.chipRow}>
          {placeEmojis.map((entry) => (
            <Pressable
              key={entry}
              accessibilityRole="radio"
              accessibilityState={{ selected: emoji === entry }}
              onPressIn={lightTap}
              onPress={() => onPick(entry)}
              style={[styles.emojiChip, emoji === entry && styles.chipSelected]}
            >
              <Text style={styles.emojiChipText}>{entry}</Text>
            </Pressable>
          ))}
        </View>
        <SheetTextInput
          accessibilityLabel="Custom emoji"
          value={placeEmojis.includes(emoji) ? "" : emoji}
          onChangeText={(value) => {
            const next = [...value][0] ?? "";
            if (next) {
              onPick(next);
            }
          }}
          placeholder="Or type your own"
          placeholderTextColor={theme.mutedForeground}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onDismiss}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Use this</Text>
          <Ionicons name="checkmark" size={20} color="#f5f3ff" />
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    page: {
      flexGrow: 1,
      gap: spacing.xl,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      paddingBottom: 132,
      backgroundColor: theme.background,
    },
    pageHeader: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    headerCopy: { flex: 1, gap: spacing.xs },
    pageTitle: {
      color: theme.foreground,
      fontSize: 32,
      lineHeight: 37,
      fontFamily: font.extrabold,
      letterSpacing: -0.7,
    },
    iconButton: {
      width: touchTarget,
      height: touchTarget,
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetSurface: {
      backgroundColor: theme.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sheetHandle: { backgroundColor: theme.ring },
    sheetBody: {
      gap: spacing.md,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.sm,
      paddingBottom: 44,
    },
    sheetListContent: {
      gap: spacing.md,
      paddingHorizontal: spacing.xxl,
      paddingBottom: 44,
    },
    eyebrow: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    sheetTitle: {
      color: theme.foreground,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: font.extrabold,
      letterSpacing: -0.6,
    },
    choice: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    choiceCopy: { flex: 1, gap: 2 },
    choiceTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    field: { gap: spacing.sm },
    fieldLabel: {
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    input: {
      minHeight: 56,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.ring,
      color: theme.foreground,
      backgroundColor: theme.secondary,
      fontSize: fontSize.body,
      fontFamily: font.regular,
    },
    amountInput: {
      minHeight: 72,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.ring,
      color: theme.foreground,
      backgroundColor: theme.secondary,
      fontSize: 32,
      fontFamily: font.extrabold,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    chip: {
      minHeight: touchTarget,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    chipSelected: { borderColor: theme.primary, borderWidth: 2 },
    chipText: {
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    emojiOpen: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    emojiPreview: { fontSize: 32, lineHeight: 38 },
    emojiChip: {
      width: touchTarget,
      height: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    emojiChipText: { fontSize: 22 },
    muted: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    primaryButton: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
      backgroundColor: theme.primary,
    },
    primaryButtonText: {
      color: theme.primaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  });
