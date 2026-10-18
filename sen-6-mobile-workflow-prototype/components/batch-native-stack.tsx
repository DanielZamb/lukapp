// Variant D of batched compose: the batch is a real native stack.
//
// A, B and C fake their navigation with component state, so back gestures,
// header collapse and modal dismissal all have to be hand-built. D drives
// react-native-screens directly — the same native stack every RN navigator
// sits on — to ask whether the platform already carries the batch well
// enough that a custom tray is unnecessary.
//
// Root screen is the tape: every queued draft with its signed amount, and
// the net the batch will post. Adding one presents a native modal; dragging
// it down is the platform's own "never mind" and leaves the batch untouched.
//
// On web react-native-screens degrades to plain views, so the top screen is
// rendered directly with a JS header standing in for the native one.

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ComposeModeToggle,
  CreateTxPrototype,
  parseCopAmount,
  type ComposeMode,
  type QueuedTx,
  type TxDraft,
  type TxPlace,
} from "./create-tx-prototype";
import {
  currencySymbol,
  paletteColor,
  type CategoryLook,
} from "./first-time-setup";
import { lookFor } from "./level-1-door";

const isWeb = Platform.OS === "web";
const isIos = Platform.OS === "ios";

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function batchTotals(queue: QueuedTx[]) {
  let out = 0;
  let incoming = 0;
  for (const item of queue) {
    const signed = parseCopAmount(item.draft.amount);
    if (signed < 0) {
      out += Math.abs(signed);
    } else {
      incoming += signed;
    }
  }
  return { out, incoming, net: incoming - out };
}

function signedMoney(value: number, symbol: string) {
  const sign = value < 0 ? "−" : "+";
  return `${sign}${symbol}${Math.abs(value).toLocaleString("es-CO")}`;
}

export function BatchNativeStack({
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
  onKeep,
  onPostAll,
  onSelectQueued,
  onRemoveQueued,
  onAddPlace,
  onBack,
  composeMode,
  onComposeMode,
}: {
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
  onKeep: () => boolean;
  onPostAll: () => boolean;
  onSelectQueued: (id: string) => void;
  onRemoveQueued: (id: string) => void;
  onAddPlace: (field: "place" | "destination") => void;
  onBack: () => void;
  composeMode?: ComposeMode;
  onComposeMode?: (mode: ComposeMode) => void;
}) {
  const [composing, setComposing] = useState(false);
  // The header pill only earns its place once the full-width Post has
  // scrolled away. Two live Post buttons at rest is one accessory too many.
  const [primaryInView, setPrimaryInView] = useState(true);
  const [posted, setPosted] = useState<{ count: number; net: string } | null>(
    null,
  );
  const close = useCallback(() => setComposing(false), []);

  // The native stack owns the gesture, but nothing owns the Android hardware
  // back button until a navigator is mounted. Close the modal ourselves.
  useEffect(() => {
    if (Platform.OS !== "android" || !composing) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        close();
        return true;
      },
    );
    return () => subscription.remove();
  }, [composing, close]);

  function openCompose() {
    setComposing(true);
  }

  function editQueued(id: string) {
    onSelectQueued(id);
    setComposing(true);
  }

  function addToBatch() {
    const ok = onKeep();
    if (ok) {
      setComposing(false);
    }
    return ok;
  }

  // Posting empties the tape, so the count and the net have to be read before
  // the commit lands.
  function postBatch() {
    const snapshot = {
      count: queue.length,
      net: signedMoney(batchTotals(queue).net, currencySymbol(currency)),
    };
    if (!onPostAll()) {
      return false;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    setPosted(snapshot);
    return true;
  }

  const tape = (
    <BatchTape
      theme={theme}
      themeMode={themeMode}
      currency={currency}
      queue={queue}
      places={places}
      categoryLooks={categoryLooks}
      onAdd={openCompose}
      onEdit={editQueued}
      onRemove={onRemoveQueued}
      onPost={postBatch}
      onPrimaryInView={setPrimaryInView}
      posted={posted}
      onDone={onBack}
      onBack={onBack}
      composeMode={composeMode}
      onComposeMode={onComposeMode}
    />
  );

  const showHeaderPost = queue.length > 0 && !primaryInView && !posted;

  const compose = (
    <CreateTxPrototype
      key={formKey}
      theme={theme}
      themeMode={themeMode}
      currency={currency}
      draft={draft}
      categories={categories}
      categoryLooks={categoryLooks}
      places={places}
      sourceNote={sourceNote}
      saveLabel="Add to batch"
      saveKind="queue"
      onDraft={onDraft}
      onCategories={onCategories}
      onLooks={onLooks}
      onSave={addToBatch}
      onAddPlace={onAddPlace}
      onBack={close}
    />
  );

  if (isWeb) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {composing ? compose : tape}
      </View>
    );
  }

  return (
    <ScreenStack style={{ flex: 1 }}>
      <ScreenStackItem
        screenId="batch-tape"
        stackPresentation="push"
        contentStyle={{ backgroundColor: theme.background }}
        style={StyleSheet.absoluteFill}
        headerConfig={{
          title: "Batch",
          largeTitle: isIos,
          hideBackButton: true,
          hideShadow: true,
          // iOS wants the content to slide under a translucent bar so the
          // large title can collapse. Android reads translucent as "no
          // ScrollingViewBehavior" and drops the toolbar on top of the page.
          translucent: isIos,
          backgroundColor: theme.background,
          color: theme.foreground,
          titleColor: theme.foreground,
          titleFontFamily: font.bold,
          titleFontSize: fontSize.action,
          largeTitleColor: theme.foreground,
          largeTitleFontFamily: font.extrabold,
          largeTitleFontSize: 34,
          children: (
            <>
              <ScreenStackHeaderLeftView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Leave the batch"
                  hitSlop={8}
                  onPressIn={lightTap}
                  onPress={onBack}
                  style={{ width: 40, height: 40, justifyContent: "center" }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={26}
                    color={theme.foreground}
                  />
                </Pressable>
                {/* A left subview clears toolbar.title on Android, so the app
                    bar title rides alongside the chevron. iOS keeps its own
                    large title and needs nothing here. */}
                {!isIos && (
                  <Text
                    style={{
                      color: theme.foreground,
                      fontSize: fontSize.title,
                      fontFamily: font.bold,
                      letterSpacing: -0.3,
                    }}
                  >
                    Batch
                  </Text>
                )}
              </ScreenStackHeaderLeftView>
              <ScreenStackHeaderRightView>
                {showHeaderPost ? (
                  <HeaderPost
                    theme={theme}
                    count={queue.length}
                    onPress={postBatch}
                  />
                ) : (
                  <View />
                )}
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
          contentStyle={{ backgroundColor: theme.background }}
          style={StyleSheet.absoluteFill}
          headerConfig={{ hidden: true }}
          onDismissed={close}
        >
          {compose}
        </ScreenStackItem>
      )}
    </ScreenStack>
  );
}

// "Post 4" rides in the native header so the commit stays reachable after the
// large title has collapsed away.
function HeaderPost({
  theme,
  count,
  onPress,
}: {
  theme: Theme;
  count: number;
  onPress: () => boolean;
}) {
  const disabled = count === 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={disabled ? "Nothing to post" : `Post ${count} drafts`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 34,
          paddingHorizontal: spacing.md,
          borderRadius: radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.primary,
        },
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.72 },
      ]}
    >
      <Text
        style={{
          color: theme.primaryForeground,
          fontSize: 14,
          fontFamily: font.bold,
        }}
      >
        {disabled ? "Post" : `Post ${count}`}
      </Text>
    </Pressable>
  );
}

// The tape: one row per queued draft, then the arithmetic those rows add up
// to. Rows and totals share a card because the net is only trustworthy when
// you can see the lines it came from.
function BatchTape({
  theme,
  themeMode,
  currency,
  queue,
  places,
  categoryLooks,
  onAdd,
  onEdit,
  onRemove,
  onPost,
  onPrimaryInView,
  posted,
  onDone,
  onBack,
  composeMode,
  onComposeMode,
}: {
  theme: Theme;
  themeMode: ThemeMode;
  currency: string;
  queue: QueuedTx[];
  places: TxPlace[];
  categoryLooks: Record<string, CategoryLook>;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onPost: () => boolean;
  onPrimaryInView: (inView: boolean) => void;
  posted: { count: number; net: string } | null;
  onDone: () => void;
  onBack: () => void;
  composeMode?: ComposeMode;
  onComposeMode?: (mode: ComposeMode) => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const symbol = currencySymbol(currency);

  const totals = useMemo(() => batchTotals(queue), [queue]);

  const empty = queue.length === 0;

  // Where the full-width Post sits inside the scroll content, so the native
  // header knows when to take the action over.
  const primaryBox = useRef({ y: 0, height: 0 });

  function trackPrimary(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const { y, height } = primaryBox.current;
    if (height === 0) {
      return;
    }
    onPrimaryInView(
      contentOffset.y + layoutMeasurement.height > y + height / 2,
    );
  }

  return (
    <View style={styles.host}>
      <SafeAreaView
        style={styles.safeArea}
        edges={isWeb ? ["top", "left", "right"] : ["left", "right"]}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          contentInsetAdjustmentBehavior="automatic"
          onScroll={trackPrimary}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator={false}
        >
          {isWeb && (
            <View style={styles.webHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Leave the batch"
                hitSlop={8}
                onPressIn={lightTap}
                onPress={onBack}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={24}
                  color={theme.foreground}
                />
              </Pressable>
              <Text style={styles.pageTitle}>Batch</Text>
            </View>
          )}

          {onComposeMode && composeMode ? (
            <ComposeModeToggle
              mode={composeMode}
              theme={theme}
              onMode={onComposeMode}
            />
          ) : null}

          <Text style={styles.lede}>
            {empty
              ? "Add the transactions you want to post together. They stay on this device until you post."
              : `${queue.length} ${queue.length === 1 ? "draft" : "drafts"} held on this device. Nothing is posted yet.`}
          </Text>

          {empty ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>The batch is empty</Text>
              <Text style={styles.muted}>
                Every one you add lands here with its amount, so you can check
                the net before it posts.
              </Text>
            </View>
          ) : (
            <View style={styles.tape}>
              {queue.map((item) => {
                const look = lookFor(item.draft.category, categoryLooks);
                const place = places.find(
                  (entry) => entry.id === item.draft.placeId,
                );
                const signed = parseCopAmount(item.draft.amount);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${item.draft.description || "untitled draft"}`}
                    onPressIn={lightTap}
                    onPress={() => onEdit(item.id)}
                    style={({ pressed }) => [
                      styles.tapeRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.chip,
                        {
                          backgroundColor: `${paletteColor(look.color, themeMode)}${themeMode === "dark" ? "33" : "22"}`,
                        },
                      ]}
                    >
                      <Text style={styles.chipEmoji}>{look.emoji}</Text>
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.draft.description || "Untitled"}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {item.draft.category || "No category"} ·{" "}
                        {place?.name ?? "No account"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.rowAmount,
                        signed > 0 && { color: theme.positive },
                      ]}
                      numberOfLines={1}
                    >
                      {signedMoney(signed, symbol)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.draft.description || "untitled draft"}`}
                      hitSlop={12}
                      onPress={() => onRemove(item.id)}
                      style={({ pressed }) => [
                        styles.remove,
                        pressed && styles.pressed,
                      ]}
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

              <View style={styles.rule} />

              {/* The split only says something when money runs both ways and a
                net on its own could be misread. */}
              {totals.out > 0 && totals.incoming > 0 && (
                <>
                  <View style={styles.splitRow}>
                    <Text style={styles.splitLabel}>Out</Text>
                    <Text style={styles.splitValue}>
                      {signedMoney(-totals.out, symbol)}
                    </Text>
                  </View>
                  <View style={styles.splitRow}>
                    <Text style={styles.splitLabel}>In</Text>
                    <Text style={styles.splitValue}>
                      {signedMoney(totals.incoming, symbol)}
                    </Text>
                  </View>
                </>
              )}

              <View style={styles.netRow}>
                <Text style={styles.netLabel}>NET</Text>
                <Text
                  style={[
                    styles.netValue,
                    totals.net > 0 && { color: theme.positive },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {signedMoney(totals.net, symbol)}
                </Text>
              </View>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPressIn={lightTap}
            onPress={onAdd}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Add one</Text>
            <Ionicons name="add" size={20} color={theme.foreground} />
          </Pressable>

          {!empty && (
            <Pressable
              accessibilityRole="button"
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                primaryBox.current = { y, height };
              }}
              onPressIn={lightTap}
              onPress={onPost}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Post {queue.length}</Text>
              <Ionicons
                name="checkmark"
                size={20}
                color={theme.primaryForeground}
              />
            </Pressable>
          )}

          <View style={styles.state}>
            <Text style={styles.eyebrow}>PROTOTYPE STATE</Text>
            <Text style={styles.muted}>
              batch ·{" "}
              {queue
                .map((item) => item.draft.description || item.id)
                .join(" · ") || "empty"}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {posted && (
        <SafeAreaView
          style={styles.postedWrap}
          edges={["bottom"]}
          pointerEvents="box-none"
        >
          <View
            style={styles.postedCard}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <View style={styles.postedIcon}>
              <Ionicons
                name="checkmark"
                size={18}
                color={theme.primaryForeground}
              />
            </View>
            <View style={styles.postedCopy}>
              <Text style={styles.postedTitle}>Posted {posted.count}</Text>
              <Text style={styles.postedDetail} numberOfLines={1}>
                Net {posted.net} · this month
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPressIn={lightTap}
              onPress={onDone}
              style={({ pressed }) => [
                styles.postedDone,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.postedDoneText}>Done</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    host: { flex: 1, backgroundColor: theme.background },
    safeArea: { flex: 1, backgroundColor: theme.background },
    postedWrap: {
      position: "absolute",
      left: spacing.xxl,
      right: spacing.xxl,
      bottom: 28,
    },
    postedCard: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    postedIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    postedCopy: { flex: 1, gap: 2 },
    postedTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.bold,
    },
    postedDetail: {
      color: theme.mutedForeground,
      fontSize: 14,
      fontFamily: font.regular,
    },
    postedDone: {
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    postedDoneText: {
      color: theme.primary,
      fontSize: 14,
      fontFamily: font.bold,
    },
    page: {
      flexGrow: 1,
      gap: spacing.xl,
      paddingHorizontal: spacing.xxl,
      paddingTop: isWeb ? spacing.md : spacing.lg,
      paddingBottom: 132,
    },
    webHeader: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    pageTitle: {
      flex: 1,
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
    lede: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    muted: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    eyebrow: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    tape: {
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
      paddingBottom: spacing.lg,
    },
    tapeRow: {
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
    chipEmoji: { fontSize: 16 },
    rowCopy: { flex: 1, gap: 2 },
    rowTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    rowMeta: {
      color: theme.mutedForeground,
      fontSize: 13,
      fontFamily: font.regular,
    },
    rowAmount: {
      flexShrink: 0,
      color: theme.foreground,
      fontSize: 15,
      fontFamily: font.semibold,
      fontVariant: ["tabular-nums"],
    },
    remove: {
      width: 26,
      height: 26,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    rule: {
      height: 1,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      marginHorizontal: spacing.lg,
      backgroundColor: theme.border,
    },
    splitRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: 3,
    },
    splitLabel: {
      color: theme.mutedForeground,
      fontSize: 14,
      fontFamily: font.medium,
    },
    splitValue: {
      color: theme.mutedForeground,
      fontSize: 14,
      fontFamily: font.medium,
      fontVariant: ["tabular-nums"],
    },
    netRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    netLabel: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    netValue: {
      flexShrink: 1,
      color: theme.foreground,
      fontSize: 30,
      lineHeight: 34,
      fontFamily: font.extrabold,
      letterSpacing: -0.8,
      fontVariant: ["tabular-nums"],
    },
    emptyCard: {
      gap: spacing.sm,
      padding: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    emptyTitle: {
      color: theme.foreground,
      fontSize: fontSize.title,
      fontFamily: font.bold,
      letterSpacing: -0.3,
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
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    state: { gap: spacing.xs },
  });
