import { formatAmount } from "../money";
import type { Theme } from "../../ui/tokens";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import {
  ActionBar,
  CenteredMoment,
  DateSection,
  EmojiTile,
  Header,
  IconButton,
  IconTile,
  ListRow,
  MoneyHero,
  Presentation,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Text,
  TintCard,
  InlineNotice,
  moneyTone,
  theme,
  useNativeStackHeaderConfig,
  useTheme,
  useUi,
} from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { ComposeModeToggle } from "./ComposeModeToggle";
import {
  signedBatchAmount,
  type QueuedPosting,
  type usePostingBatch,
} from "./usePostingBatch";
import { categoryColor } from "../categories/appearance";
import type { Category } from "../categories/model";
import { useT, type Translator } from "../../i18n";

type Row = {
  category: string;
  place: string;
  emoji: string;
  color: string;
  lookColor?: ComponentProps<typeof EmojiTile>["color"];
};

export function batchSharedPlace(
  queue: QueuedPosting[],
  rowFor: (item: QueuedPosting) => Row,
) {
  const places = queue.map((item) => {
    const { command } = item;
    const payload = command.payload;
    return command.kind === "transfer"
      ? command.payload.sourceFinancialAccountProfileId
      : "financialAccountProfileId" in payload
        ? payload.financialAccountProfileId
        : undefined;
  });
  const first = queue[0];
  return first && places[0] && places.every((id) => id === places[0])
    ? rowFor(first).place
    : undefined;
}

export function batchRowFor({
  item,
  categories,
  profiles,
  t,
}: {
  item: QueuedPosting;
  categories: Pick<Category, "id" | "name" | "style">[] | undefined;
  profiles: { id: string; name: string }[] | undefined;
  t: Translator["t"];
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
            t("posting.savedCategory"),
        )
        .join(" · ") || t("posting.batchNoCategory"),
    place:
      profiles?.find((row) => row.id === profileId)?.name ??
      t("posting.batchNoAccount"),
    emoji: category?.style.emoji ?? "💰",
    color: category ? categoryColor(category.style) : theme.primary,
    lookColor: category
      ? {
          light: categoryColor(category.style),
          dark: categoryColor(category.style, "dark"),
        }
      : undefined,
  };
}

export function signedBatchMoney(minorUnits: number, currency: string) {
  return `${minorUnits < 0 ? "−" : "+"}${currency === "COP" ? "$" : `${currency} `}${formatAmount(Math.abs(minorUnits), currency, { hideZeroDecimals: true })}`;
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
  const { t, tn } = useT();
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      accessibilityLabel={t("posting.batchLeave")}
      onPress={onBack}
      style={styles.back}
    >
      <Ionicons name="chevron-back" size={26} color={theme.foreground} />
    </Pressable>
  );
  const headerPost = showHeaderPost ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("posting.batchPostCount", { count: queue.length })}
      disabled={batch.busy}
      onPress={() => void batch.postAll()}
      style={styles.headerPost}
    >
      <Text preset="filterSort" style={styles.headerPostText}>
        {t("posting.batchPostCount", { count: queue.length })}
      </Text>
    </Pressable>
  ) : (
    <View />
  );
  const legacyTape = (
    <SafeAreaView
      style={ui.screen}
      edges={
        Platform.OS === "web" ? ["top", "left", "right"] : ["left", "right"]
      }
    >
      {Platform.OS === "web" && (
        <View style={styles.webHeader}>
          {back}
          <Text variant="section" style={ui.title}>
            {t("posting.batchTitle")}
          </Text>
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
        <Text preset="rowSubtitle" style={styles.muted}>
          {queue.length === 0
            ? t("posting.batchIntroEmpty")
            : tn("posting.batchHeld", queue.length)}
        </Text>
        {queue.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text variant="section" style={styles.emptyTitle}>
              {t("posting.batchEmptyTitle")}
            </Text>
            <Text preset="rowSubtitle" style={styles.muted}>
              {t("posting.batchEmptyBody")}
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
                  accessibilityLabel={t("posting.batchEditA11y", { title: description || t("posting.batchUntitledA11y") })}
                  disabled={!batch.editable}
                  onPress={() => onEdit(item)}
                  style={styles.row}
                >
                  <View
                    style={[styles.chip, { backgroundColor: `${row.color}22` }]}
                  >
                    <Text preset="emoji16">{row.emoji}</Text>
                  </View>
                  <View style={styles.rowCopy}>
                    <Text
                      preset="rowName"
                      style={styles.rowTitle}
                      numberOfLines={2}
                    >
                      {description || t("posting.batchUntitled")}
                    </Text>
                    <Text
                      preset="rowMeta"
                      style={styles.rowMeta}
                      numberOfLines={2}
                    >
                      {row.category} · {row.place}
                    </Text>
                  </View>
                  <Text
                    preset="batchAmount"
                    style={[styles.rowAmount, amount > 0 && styles.positive]}
                  >
                    {signedBatchMoney(amount, currency)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("posting.batchRemoveA11y", { title: description || t("posting.batchUntitledA11y") })}
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
                  <Text preset="rowSubtitle" style={styles.muted}>
                    {t("posting.batchOut")}
                  </Text>
                  <Text preset="batchAmount" style={styles.rowAmount}>
                    {signedBatchMoney(-totals.out, currency)}
                  </Text>
                </View>
                <View style={styles.splitRow}>
                  <Text preset="rowSubtitle" style={styles.muted}>
                    {t("posting.batchIn")}
                  </Text>
                  <Text preset="batchAmount" style={styles.rowAmount}>
                    {signedBatchMoney(totals.incoming, currency)}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.netRow}>
              <Text variant="label" style={styles.netLabel}>
                {t("posting.batchNet")}
              </Text>
              <Text
                preset="batchNet"
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
          label={t("posting.batchAddOne")}
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
              label={t("posting.batchPostCount", { count: queue.length })}
              trailingIcon="checkmark"
              pending={batch.busy}
              onPress={() => void batch.postAll()}
            />
          </View>
        )}
        {!!batch.error && (
          <Text preset="caption" accessibilityRole="alert" style={ui.error}>
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
            <Text preset="rowName" style={styles.rowTitle}>
              {tn("posting.batchPosted", posted.count)}
            </Text>
            <Text preset="rowMeta" style={styles.rowMeta}>
              {t("posting.batchPostedNet", { amount: signedBatchMoney(posted.net, currency) })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.done")}
            onPress={onBack}
            style={styles.back}
          >
            <Text preset="rowName" style={styles.rowTitle}>
              {t("common.done")}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
  const sharedPlace = batchSharedPlace(queue, rowFor);
  const tape = (
    <Presentation legacy={legacyTape}>
      <Screen
        footer={
          posted ? (
            <ActionBar
              primary={{ label: t("common.done"), onPress: onBack, icon: "checkmark" }}
              secondary={{
                label: t("posting.batchAddOne"),
                onPress: onAdd,
                icon: "add",
                disabled: !batch.editable,
              }}
            />
          ) : (
            <ActionBar
              primary={
                queue.length > 0
                  ? {
                      label: t("posting.batchPostCount", { count: queue.length }),
                      onPress: () => void batch.postAll(),
                      pending: batch.busy,
                      icon: "checkmark",
                    }
                  : undefined
              }
              secondary={{
                label: t("posting.batchAddOne"),
                onPress: onAdd,
                icon: "add",
                disabled: !batch.editable,
              }}
            />
          )
        }
      >
        {posted ? (
          <CenteredMoment
            icon="checkmark"
            tone="positive"
            title={tn("posting.batchPosted", posted.count)}
            amount={
              <MoneyHero
                currency={currency}
                amount={formatAmount(Math.abs(posted.net), currency, {
                  hideZeroDecimals: true,
                })}
                negative={posted.net < 0}
                tone={moneyTone(posted.net)}
                align="center"
              />
            }
          />
        ) : (
          <>
            <Header title={t("posting.batchTitle")} onBack={onBack} />
            <ComposeModeToggle
              mode="batch"
              count={queue.length}
              disabled={!batch.editable}
              onMode={(mode) => {
                if (mode === "one") onOne();
              }}
            />
            <TintCard>
              <Text variant="label" tone="muted">
                {tn("posting.batchNetOf", queue.length)}
              </Text>
              <MoneyHero
                currency={currency}
                amount={formatAmount(Math.abs(totals.net), currency, {
                  hideZeroDecimals: true,
                })}
                negative={totals.net < 0}
                tone={moneyTone(totals.net)}
              />
              <Text variant="meta" tone="muted">
                {t("posting.batchNotPosted")}
              </Text>
            </TintCard>
            {batch.error ? (
              <InlineNotice
                tone="danger"
                title={t("posting.formCouldntPost")}
                detail={batch.error}
              />
            ) : null}
            {queue.length === 0 ? (
              <CenteredMoment
                icon="documents-outline"
                tone="soft"
                title={t("posting.batchEmptyTitle")}
                body={t("posting.batchEmptyBody")}
              />
            ) : (
              <DateSection
                date="In this batch"
                place={sharedPlace ? `From ${sharedPlace}` : undefined}
              >
                {queue.map((item) => {
                  const row = rowFor(item);
                  const description =
                    "description" in item.command.payload
                      ? item.command.payload.description
                      : item.command.payload.name;
                  const amount = signedBatchAmount(item.command);
                  const title =
                    item.command.kind === "transfer"
                      ? "Transfer"
                      : item.command.kind === "opening"
                        ? "Initial balance"
                        : row.category;
                  return (
                    <ListRow
                      key={item.id}
                      title={title}
                      value={signedBatchMoney(amount, currency)}
                      meta={[
                        sharedPlace ? "" : row.place,
                        description || "Untitled",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      leading={
                        item.command.kind === "transfer" ? (
                          <IconTile
                            icon="swap-horizontal"
                            tone="neutral"
                            size={36}
                          />
                        ) : (
                          <EmojiTile
                            emoji={row.emoji}
                            color={row.lookColor ?? row.color}
                            size={36}
                          />
                        )
                      }
                      tone={moneyTone(amount)}
                      chevron={false}
                      onPress={batch.editable ? () => onEdit(item) : undefined}
                      trailing={
                        <IconButton
                          preset="remove"
                          icon="close"
                          iconSize={20}
                          accessibilityLabel={t("posting.batchRemoveA11y", { title: description || t("posting.batchUntitledA11y") })}
                          disabled={!batch.editable}
                          onPress={(event) => {
                            event.stopPropagation();
                            batch.remove(item.id);
                          }}
                        />
                      }
                    />
                  );
                })}
              </DateSection>
            )}
          </>
        )}
      </Screen>
    </Presentation>
  );
  const headerConfig = useNativeStackHeaderConfig({
    hidden: false,
    title: t("posting.batchTitle"),
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
          {Platform.OS !== "ios" && (
            <Text variant="section" style={ui.title}>
              {t("posting.batchTitle")}
            </Text>
          )}
        </ScreenStackHeaderLeftView>
        <ScreenStackHeaderRightView>{headerPost}</ScreenStackHeaderRightView>
      </>
    ),
  });
  if (Platform.OS === "web") return composing ? compose : tape;
  return (
    <ScreenStack style={{ flex: 1 }}>
      <ScreenStackItem
        screenId="batch-tape"
        stackPresentation="push"
        style={StyleSheet.absoluteFill}
        contentStyle={{ backgroundColor: theme.background }}
        headerConfig={headerConfig}
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

function createStyles(theme: Theme) {
  return StyleSheet.create({
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
    },
    muted: {
      color: theme.mutedForeground,
      fontFamily: font.regular,
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
      color: theme.foreground,
    },
    rowMeta: {
      fontFamily: font.regular,
      color: theme.mutedForeground,
    },
    rowAmount: {
      fontFamily: font.semibold,
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
      color: theme.mutedForeground,
      letterSpacing: 1,
    },
    netValue: {
      flexShrink: 1,
      fontFamily: font.extrabold,
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
}
