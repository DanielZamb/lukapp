import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  ScreenStack,
  ScreenStackHeaderLeftView,
  ScreenStackHeaderRightView,
  ScreenStackItem,
} from "react-native-screens";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton, SecondaryButton, theme, ui } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";
import { ComposeModeToggle } from "./ComposeModeToggle";
import {
  signedBatchAmount,
  type QueuedPosting,
  type usePostingBatch,
} from "./usePostingBatch";
import { categoryColor } from "../categories/appearance";
import type { Category } from "../categories/model";

type Row = { category: string; place: string; emoji: string; color: string };
export function batchRowFor({
  item,
  categories,
  profiles,
}: {
  item: QueuedPosting;
  categories: Pick<Category, "id" | "name" | "style">[] | undefined;
  profiles: { id: string; name: string }[] | undefined;
}): Row {
  const command = item.command;
  const payload = command.payload;
  const ids =
    "userCategoryIds" in payload ? payload.userCategoryIds : undefined;
  const primaryId =
    "primaryUserCategoryId" in payload
      ? payload.primaryUserCategoryId
      : undefined;
  const category = categories?.find(
    (row) => row.id === (primaryId ?? ids?.[0]),
  );
  const profileId =
    command.kind === "transfer"
      ? command.payload.sourceFinancialAccountProfileId
      : "financialAccountProfileId" in payload
        ? payload.financialAccountProfileId
        : undefined;
  return {
    category:
      ids
        ?.map(
          (id) =>
            categories?.find((row) => row.id === id)?.name ??
            "Saved category",
        )
        .join(" · ") || "No category",
    place:
      profiles?.find((row) => row.id === profileId)?.name ??
      "No account",
    emoji: category?.style.emoji ?? "💰",
    color: category ? categoryColor(category.style) : theme.primary,
  };
}

export function signedBatchMoney(minorUnits: number, currency: string) {
  return `${minorUnits < 0 ? "−" : "+"}${currency === "COP" ? "$" : `${currency} `}${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Math.abs(minorUnits) / 100)}`;
}

export function BatchNativeStack({
  batch,
  currency,
  composing,
  compose,
  onCancel,
  onAdd,
  onEdit,
  onBack,
  onOne,
  rowFor,
}: {
  batch: ReturnType<typeof usePostingBatch>;
  currency: string;
  composing: boolean;
  compose: ReactNode;
  onCancel: () => void;
  onAdd: () => void;
  onEdit: (item: QueuedPosting) => void;
  onBack: () => void;
  onOne: () => void;
  rowFor: (item: QueuedPosting) => Row;
}) {
  const [primaryInView, setPrimaryInView] = useState(true);
  const primaryBox = useRef({ y: 0, height: 0 });
  const { queue, posted } = batch;
  const showHeaderPost = queue.length > 0 && !primaryInView && !posted;
  const totals = queue.reduce(
    (sum, item) => {
      const amount = signedBatchAmount(item.command);
      return {
        out: sum.out + Math.max(0, -amount),
        incoming: sum.incoming + Math.max(0, amount),
        net: sum.net + amount,
      };
    },
    { out: 0, incoming: 0, net: 0 },
  );
  useEffect(() => {
    if (Platform.OS !== "android" || !composing) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onCancel();
        return true;
      },
    );
    return () => subscription.remove();
  }, [composing, onCancel]);
  useEffect(() => {
    setPrimaryInView(true);
  }, [queue.length]);
  function trackPrimary(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const { y, height } = primaryBox.current;
    if (height)
      setPrimaryInView(
        contentOffset.y + layoutMeasurement.height > y + height / 2 &&
          contentOffset.y < y + height,
      );
  }
  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Leave the batch"
      onPress={onBack}
      style={styles.back}
    >
      <Ionicons name="chevron-back" size={26} color={theme.foreground} />
    </Pressable>
  );
  const headerPost = showHeaderPost ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Post ${queue.length}`}
      disabled={batch.busy}
      onPress={() => void batch.postAll()}
      style={styles.headerPost}
    >
      <Text style={styles.headerPostText}>Post {queue.length}</Text>
    </Pressable>
  ) : (
    <View />
  );
  const tape = (
    <SafeAreaView
      style={ui.screen}
      edges={
        Platform.OS === "web" ? ["top", "left", "right"] : ["left", "right"]
      }
    >
      {Platform.OS === "web" && (
        <View style={styles.webHeader}>
          {back}
          <Text style={ui.title}>Batch</Text>
          {headerPost}
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.page}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={trackPrimary}
        scrollEventThrottle={32}
      >
        <ComposeModeToggle
          mode="batch"
          disabled={!batch.editable}
          onMode={(mode) => {
            if (mode === "one") onOne();
          }}
        />
        <Text style={styles.muted}>
          {queue.length === 0
            ? "Add the transactions you want to post together. They stay on this device until you post."
            : `${queue.length} ${queue.length === 1 ? "draft" : "drafts"} held on this device. Nothing is posted yet.`}
        </Text>
        {queue.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>The batch is empty</Text>
            <Text style={styles.muted}>
              Every one you add lands here with its amount, so you can check the
              net before it posts.
            </Text>
          </View>
        ) : (
          <View style={styles.tape}>
            {queue.map((item) => {
              const row = rowFor(item);
              const description =
                "description" in item.command.payload
                  ? item.command.payload.description
                  : item.command.payload.name;
              const amount = signedBatchAmount(item.command);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${description || "untitled draft"}`}
                  disabled={!batch.editable}
                  onPress={() => onEdit(item)}
                  style={styles.row}
                >
                  <View
                    style={[styles.chip, { backgroundColor: `${row.color}22` }]}
                  >
                    <Text style={{ fontSize: 16 }}>{row.emoji}</Text>
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {description || "Untitled"}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {row.category} · {row.place}
                    </Text>
                  </View>
                  <Text
                    style={[styles.rowAmount, amount > 0 && styles.positive]}
                  >
                    {signedBatchMoney(amount, currency)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${description || "untitled draft"}`}
                    disabled={!batch.editable}
                    hitSlop={12}
                    onPress={(event) => {
                      event.stopPropagation();
                      batch.remove(item.id);
                    }}
                    style={styles.remove}
                  >
                    <Ionicons
                      name="close"
                      size={16}
                      color={theme.mutedForeground}
                    />
                  </Pressable>
                </Pressable>
              );
            })}
            {totals.out > 0 && totals.incoming > 0 && (
              <>
                <View style={styles.splitRow}>
                  <Text style={styles.muted}>Out</Text>
                  <Text style={styles.rowAmount}>
                    {signedBatchMoney(-totals.out, currency)}
                  </Text>
                </View>
                <View style={styles.splitRow}>
                  <Text style={styles.muted}>In</Text>
                  <Text style={styles.rowAmount}>
                    {signedBatchMoney(totals.incoming, currency)}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>NET</Text>
              <Text
                style={[styles.netValue, totals.net > 0 && styles.positive]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {signedBatchMoney(totals.net, currency)}
              </Text>
            </View>
          </View>
        )}
        <SecondaryButton
          label="Add one"
          trailingIcon="add"
          disabled={!batch.editable}
          onPress={onAdd}
        />
        {queue.length > 0 && (
          <View
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              primaryBox.current = { y, height };
            }}
          >
            <PrimaryButton
              label={`Post ${queue.length}`}
              trailingIcon="checkmark"
              pending={batch.busy}
              onPress={() => void batch.postAll()}
            />
          </View>
        )}
        {!!batch.error && (
          <Text accessibilityRole="alert" style={ui.error}>
            {batch.error}
          </Text>
        )}
      </ScrollView>
      {posted && (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.banner}
        >
          <View style={styles.postedIcon}>
            <Ionicons
              name="checkmark"
              size={18}
              color={theme.primaryForeground}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>Posted {posted.count}</Text>
            <Text style={styles.rowMeta}>
              Net {signedBatchMoney(posted.net, currency)} · this month
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={onBack}
            style={styles.back}
          >
            <Text style={styles.rowTitle}>Done</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
  if (Platform.OS === "web") return composing ? compose : tape;
  return (
    <ScreenStack style={{ flex: 1 }}>
      <ScreenStackItem
        screenId="batch-tape"
        stackPresentation="push"
        style={StyleSheet.absoluteFill}
        contentStyle={{ backgroundColor: theme.background }}
        headerConfig={{
          title: "Batch",
          largeTitle: Platform.OS === "ios",
          hideBackButton: true,
          hideShadow: true,
          translucent: Platform.OS === "ios",
          backgroundColor: theme.background,
          color: theme.foreground,
          titleColor: theme.foreground,
          titleFontFamily: font.bold,
          largeTitleFontFamily: font.extrabold,
          children: (
            <>
              <ScreenStackHeaderLeftView>
                {back}
                {Platform.OS !== "ios" && <Text style={ui.title}>Batch</Text>}
              </ScreenStackHeaderLeftView>
              <ScreenStackHeaderRightView>
                {headerPost}
              </ScreenStackHeaderRightView>
            </>
          ),
        }}
      >
        {tape}
      </ScreenStackItem>
      {composing && (
        <ScreenStackItem
          screenId="batch-compose"
          stackPresentation="modal"
          stackAnimation="slide_from_bottom"
          gestureEnabled
          style={StyleSheet.absoluteFill}
          contentStyle={{ backgroundColor: theme.background }}
          headerConfig={{ hidden: true }}
          onDismissed={onCancel}
        >
          {compose}
        </ScreenStackItem>
      )}
    </ScreenStack>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: 132,
  },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  back: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPost: {
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: theme.primary,
    justifyContent: "center",
  },
  headerPostText: {
    color: theme.primaryForeground,
    fontFamily: font.bold,
    fontSize: 14,
  },
  muted: {
    color: theme.mutedForeground,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    backgroundColor: theme.secondary,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: font.bold,
    fontSize: fontSize.title,
    color: theme.foreground,
  },
  tape: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    backgroundColor: theme.secondary,
    overflow: "hidden",
    paddingBottom: spacing.lg,
  },
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  chip: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: {
    fontFamily: font.semibold,
    fontSize: fontSize.body,
    color: theme.foreground,
  },
  rowMeta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: theme.mutedForeground,
  },
  rowAmount: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: theme.foreground,
    fontVariant: ["tabular-nums"],
  },
  positive: { color: theme.positive },
  remove: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  netLabel: {
    fontFamily: font.bold,
    fontSize: fontSize.label,
    color: theme.mutedForeground,
    letterSpacing: 1,
  },
  netValue: {
    flexShrink: 1,
    fontFamily: font.extrabold,
    fontSize: 32,
    color: theme.foreground,
  },
  banner: {
    margin: spacing.xxl,
    marginTop: spacing.md,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.secondary,
  },
  postedIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
