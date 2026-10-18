// Three variants of batched compose, switchable via ?batch=, on create-tx.
// A: form first, queue under the fields, keep or post.
// B: queue is the page, form opens to add one.
// C: tray stays on top, the form only adds to the batch.

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  font,
  fontSize,
  radius,
  spacing,
  touchTarget,
  type Theme,
  type ThemeMode,
} from "../theme/tokens";
import {
  CreateTxPrototype,
  parseCopAmount,
  type QueuedTx,
  type TxDraft,
  type TxPlace,
} from "./create-tx-prototype";
import type { CategoryLook } from "./first-time-setup";

export const batchVariants = ["A", "B", "C"] as const;
export type BatchVariant = (typeof batchVariants)[number];

export const batchVariantNames: Record<BatchVariant, string> = {
  A: "Form plus queue",
  B: "Queue first",
  C: "Tray composer",
};

export function normalizeBatchVariant(value?: string): BatchVariant {
  return batchVariants.find((entry) => entry === value) ?? "A";
}

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function money(amount: string) {
  const signed = parseCopAmount(amount);
  if (!amount.trim() || signed === 0) {
    return "0";
  }
  return signed > 0
    ? `+${signed.toLocaleString("es-CO")}`
    : signed.toLocaleString("es-CO");
}

export function BatchTxPrototype({
  batchVariant,
  formKey,
  theme,
  themeMode,
  currency,
  draft,
  categories,
  categoryLooks,
  places,
  queue,
  sourceNote,
  onDraft,
  onCategories,
  onLooks,
  onSave,
  onKeep,
  onPostAll,
  onSelectQueued,
  onRemoveQueued,
  onAddPlace,
  onBack,
}: {
  batchVariant: BatchVariant;
  formKey?: string | number;
  theme: Theme;
  themeMode: ThemeMode;
  currency: string;
  draft: TxDraft;
  categories: string[];
  categoryLooks: Record<string, CategoryLook>;
  places: TxPlace[];
  queue: QueuedTx[];
  sourceNote?: string;
  onDraft: (next: TxDraft) => void;
  onCategories: (next: string[]) => void;
  onLooks: (next: Record<string, CategoryLook>) => void;
  onSave: () => boolean;
  onKeep: () => boolean;
  onPostAll: () => boolean;
  onSelectQueued: (id: string) => void;
  onRemoveQueued: (id: string) => void;
  onAddPlace: (field: "place" | "destination") => void;
  onBack: () => void;
}) {
  const [composing, setComposing] = useState(
    () => Boolean(draft.description.trim() || parseCopAmount(draft.amount)),
  );
  const queuedSave = batchVariant !== "A";

  if (batchVariant === "B" && !composing) {
    return (
      <QueueFirstPage
        theme={theme}
        queue={queue}
        places={places}
        onAdd={() => setComposing(true)}
        onOpen={(id) => {
          onSelectQueued(id);
          setComposing(true);
        }}
        onRemove={onRemoveQueued}
        onPostAll={onPostAll}
        onBack={onBack}
      />
    );
  }

  return (
    <CreateTxPrototype
      key={formKey}
      theme={theme}
      themeMode={themeMode}
      currency={currency}
      draft={draft}
      categories={categories}
      categoryLooks={categoryLooks}
      places={places}
      queue={queue}
      queuePlacement={
        batchVariant === "C" ? "top" : batchVariant === "A" ? "after-fields" : "none"
      }
      sourceNote={sourceNote}
      saveLabel={queuedSave ? "Add to batch" : "Post"}
      saveKind={queuedSave ? "queue" : "post"}
      onKeep={batchVariant === "A" ? onKeep : undefined}
      onPostAll={onPostAll}
      onSelectQueued={onSelectQueued}
      onRemoveQueued={onRemoveQueued}
      onDraft={onDraft}
      onCategories={onCategories}
      onLooks={onLooks}
      onSave={
        queuedSave
          ? () => {
              const ok = onKeep();
              if (ok && batchVariant === "B") {
                setComposing(false);
              }
              return ok;
            }
          : onSave
      }
      onAddPlace={onAddPlace}
      onBack={
        batchVariant === "B" && composing ? () => setComposing(false) : onBack
      }
    />
  );
}

function QueueFirstPage({
  theme,
  queue,
  places,
  onAdd,
  onOpen,
  onRemove,
  onPostAll,
  onBack,
}: {
  theme: Theme;
  queue: QueuedTx[];
  places: TxPlace[];
  onAdd: () => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onPostAll: () => boolean;
  onBack: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPressIn={lightTap}
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>THIS BATCH</Text>
            <Text style={styles.pageTitle}>Drafts to post</Text>
          </View>
        </View>

        <Text style={styles.muted}>
          {queue.length === 0
            ? "Nothing queued. Add one, then post the batch."
            : `${queue.length} local drafts, same objects as Drafts.`}
        </Text>

        <View style={styles.listGroup}>
          {queue.length === 0 ? (
            <View style={styles.listRow}>
              <Text style={styles.muted}>This batch is empty.</Text>
            </View>
          ) : (
            queue.map((item) => {
              const place = places.find((entry) => entry.id === item.draft.placeId);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPressIn={lightTap}
                  onPress={() => onOpen(item.id)}
                  style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
                >
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.draft.description || "Untitled"}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {item.draft.category || "no category"} · {place?.name ?? "no place"}
                    </Text>
                  </View>
                  <Text style={styles.rowValue}>{money(item.draft.amount)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove draft"
                    hitSlop={8}
                    onPress={() => onRemove(item.id)}
                  >
                    <Ionicons name="close" size={18} color={theme.mutedForeground} />
                  </Pressable>
                </Pressable>
              );
            })
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onAdd}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>Add one</Text>
          <Ionicons name="add" size={20} color={theme.foreground} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: queue.length === 0 }}
          disabled={queue.length === 0}
          onPressIn={lightTap}
          onPress={onPostAll}
          style={({ pressed }) => [
            styles.primaryButton,
            queue.length === 0 && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {queue.length === 0 ? "Post batch" : `Post ${queue.length}`}
          </Text>
          <Ionicons name="checkmark" size={20} color="#f5f3ff" />
        </Pressable>

        <View style={styles.state}>
          <Text style={styles.eyebrow}>PROTOTYPE STATE</Text>
          <Text style={styles.muted}>
            B · queue {queue.map((item) => item.draft.description || item.id).join(" · ") || "empty"}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
      paddingBottom: 80,
      backgroundColor: theme.background,
    },
    pageHeader: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    headerCopy: { flex: 1, gap: spacing.xs },
    eyebrow: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
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
    muted: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    listGroup: {
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
    },
    listRow: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowCopy: { flex: 1, gap: spacing.xs },
    rowTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    rowValue: {
      flexShrink: 0,
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    primaryButton: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
      backgroundColor: theme.primary,
    },
    primaryButtonText: {
      color: theme.primaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    secondaryButton: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    secondaryButtonText: {
      color: theme.foreground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    state: { gap: spacing.xs },
  });
