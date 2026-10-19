// Four variants of level 0 first-run setup
// (currency → notifications → categories → starting amount),
// switchable via ?variant=. Personal Workspace and "My money" are silent.

import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  font,
  fontSize,
  radius,
  spacing,
  themes,
  touchTarget,
  type Theme,
  type ThemeMode,
} from "../theme/tokens";
// BottomSheetTextInput drives the sheet's keyboard animation on native, but
// its blur handler calls TextInput.State APIs react-native-web lacks.
export const SheetTextInput = (
  Platform.OS === "web" ? TextInput : BottomSheetTextInput
) as typeof TextInput;

const symbolByCurrency: Record<string, string> = {
  COP: "$",
  USD: "$",
  MXN: "$",
  ARS: "$",
  CLP: "$",
  UYU: "$",
  DOP: "$",
  CAD: "$",
  AUD: "$",
  NZD: "$",
  SGD: "$",
  HKD: "$",
  TWD: "$",
  BRL: "R$",
  PEN: "S/",
  PYG: "₲",
  BOB: "Bs",
  VES: "Bs",
  CRC: "₡",
  GTQ: "Q",
  HNL: "L",
  NIO: "C$",
  PAB: "B/.",
  EUR: "€",
  GBP: "£",
  CHF: "CHF ",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
  INR: "₹",
  SEK: "kr ",
  NOK: "kr ",
  DKK: "kr ",
  PLN: "zł ",
  CZK: "Kč ",
  HUF: "Ft ",
  RON: "lei ",
  TRY: "₺",
  ZAR: "R",
  EGP: "E£",
  NGN: "₦",
  KES: "KSh ",
  MAD: "DH ",
  ILS: "₪",
  AED: "د.إ ",
  SAR: "﷼ ",
  QAR: "﷼ ",
  THB: "฿",
  VND: "₫",
  IDR: "Rp ",
  MYR: "RM ",
  PHP: "₱",
};

export function currencySymbol(code: string) {
  return symbolByCurrency[code] ?? `${code} `;
}

export const onboardingVariants = ["A", "B", "C", "D"] as const;
export type OnboardingVariant = (typeof onboardingVariants)[number];

export const onboardingVariantNames: Record<OnboardingVariant, string> = {
  A: "One question",
  B: "Tap to decide",
  C: "Home fills in",
  D: "One sheet",
};

export function normalizeOnboardingVariant(
  value?: string,
): OnboardingVariant {
  return onboardingVariants.find((candidate) => candidate === value) ?? "D";
}

export type WorkspaceKind = "Personal" | "Household";
export type Currency = string;

// Mock ISO 4217 subset for the prototype; production reads the real table.
export const currencyOptions = [
  { code: "COP", name: "Colombian peso" },
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "MXN", name: "Mexican peso" },
  { code: "BRL", name: "Brazilian real" },
  { code: "ARS", name: "Argentine peso" },
  { code: "CLP", name: "Chilean peso" },
  { code: "PEN", name: "Peruvian sol" },
  { code: "UYU", name: "Uruguayan peso" },
  { code: "PYG", name: "Paraguayan guarani" },
  { code: "BOB", name: "Bolivian boliviano" },
  { code: "VES", name: "Venezuelan bolivar" },
  { code: "CRC", name: "Costa Rican colon" },
  { code: "GTQ", name: "Guatemalan quetzal" },
  { code: "HNL", name: "Honduran lempira" },
  { code: "NIO", name: "Nicaraguan cordoba" },
  { code: "PAB", name: "Panamanian balboa" },
  { code: "DOP", name: "Dominican peso" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "GBP", name: "British pound" },
  { code: "CHF", name: "Swiss franc" },
  { code: "JPY", name: "Japanese yen" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "KRW", name: "South Korean won" },
  { code: "INR", name: "Indian rupee" },
  { code: "AUD", name: "Australian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "DKK", name: "Danish krone" },
  { code: "PLN", name: "Polish zloty" },
  { code: "CZK", name: "Czech koruna" },
  { code: "HUF", name: "Hungarian forint" },
  { code: "RON", name: "Romanian leu" },
  { code: "TRY", name: "Turkish lira" },
  { code: "ZAR", name: "South African rand" },
  { code: "EGP", name: "Egyptian pound" },
  { code: "NGN", name: "Nigerian naira" },
  { code: "KES", name: "Kenyan shilling" },
  { code: "MAD", name: "Moroccan dirham" },
  { code: "ILS", name: "Israeli new shekel" },
  { code: "AED", name: "UAE dirham" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "THB", name: "Thai baht" },
  { code: "VND", name: "Vietnamese dong" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "PHP", name: "Philippine peso" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "HKD", name: "Hong Kong dollar" },
  { code: "TWD", name: "New Taiwan dollar" },
] as const;

const commonCurrencies = ["COP", "USD", "EUR", "MXN", "BRL", "ARS"];

function currencyName(code: string) {
  return currencyOptions.find((entry) => entry.code === code)?.name ?? code;
}

export type CategoryLook = { emoji: string; color: string };

export type SetupDraft = {
  currency: Currency;
  notifications: boolean | null;
  categories: string[];
  categoryLooks: Record<string, CategoryLook>;
  startingAmount: string;
  wantsBudgets: boolean;
};

type SetupStep =
  | "currency"
  | "notifications"
  | "categories"
  | "amount"
  | "complete";

const flowSteps: SetupStep[] = [
  "currency",
  "notifications",
  "categories",
  "amount",
];

export const starterCategories = [
  "Food",
  "Transport",
  "Dining",
  "Home",
  "Health",
  "Fun",
  "Shopping",
  "Bills",
  "Family",
  "Other",
];

function hslToHex(h: number, s: number, l: number) {
  const sat = s / 100;
  const lig = l / 100;
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value =
      lig - sat * Math.min(lig, 1 - lig) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// Palette ids resolve to a per-mode foreground hex; chip tints derive from
// that hex with an alpha suffix, so label text stays theme.foreground and
// keeps contrast in both modes. 24 hues at 15° steps plus 4 neutrals = 28
// swatches, generated so the light/dark lightness discipline holds for all
// of them.
export const categoryPalette = [
  ...Array.from({ length: 24 }, (_, index) => {
    const hue = index * 15;
    return {
      id: `h${hue}`,
      light: hslToHex(hue, 62, 34),
      dark: hslToHex(hue, 72, 68),
    };
  }),
  { id: "cool-gray", light: hslToHex(215, 12, 38), dark: hslToHex(215, 12, 68) },
  { id: "warm-gray", light: hslToHex(35, 12, 38), dark: hslToHex(35, 14, 68) },
  { id: "brown", light: hslToHex(25, 45, 32), dark: hslToHex(25, 45, 62) },
  { id: "olive", light: hslToHex(80, 35, 30), dark: hslToHex(80, 35, 60) },
];

// One-tap suggestions; anything else comes from the phone keyboard's emoji.
export const quickEmojis = [
  "🛒",
  "🍔",
  "🚌",
  "🏠",
  "💊",
  "🎮",
  "🛍️",
  "✨",
] as const;

export const starterLooks: Record<string, CategoryLook> = {
  Food: { emoji: "🛒", color: "h150" },
  Transport: { emoji: "🚌", color: "h210" },
  Dining: { emoji: "🍔", color: "h30" },
  Home: { emoji: "🏠", color: "h270" },
  Health: { emoji: "💊", color: "h345" },
  Fun: { emoji: "🎮", color: "h45" },
  Shopping: { emoji: "🛍️", color: "h180" },
  Bills: { emoji: "🧾", color: "cool-gray" },
  Family: { emoji: "👪", color: "h195" },
  Other: { emoji: "✨", color: "warm-gray" },
};

export const fallbackLook: CategoryLook = { emoji: "✨", color: "h270" };

export function paletteColor(id: string, mode: ThemeMode) {
  const entry = categoryPalette.find((color) => color.id === id);
  return (entry ?? categoryPalette[0])[mode];
}

// The any-emoji input keeps its value empty, so each change delivers only the
// newly typed insertion. Plain ASCII is rejected; a grapheme segmenter, when
// the engine has one, trims a multi-emoji paste to its first emoji.
function emojiFrom(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /^[ -~]+$/.test(trimmed)) {
    return null;
  }
  const segmenter = (
    Intl as {
      Segmenter?: new () => {
        segment(input: string): Iterable<{ segment: string }>;
      };
    }
  ).Segmenter;
  if (segmenter) {
    for (const part of new segmenter().segment(trimmed)) {
      return part.segment;
    }
  }
  return trimmed;
}

const currencyCopy: Record<
  Currency,
  { label: string; detail: string; done: string }
> = {
  COP: {
    label: "Colombian peso",
    detail: "COP",
    done: "Colombian pesos",
  },
  USD: {
    label: "US dollar",
    detail: "USD",
    done: "US dollars",
  },
};

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function money(amount: number, currency: Currency) {
  return `${currency} ${amount.toLocaleString("es-CO")}`;
}

function parseBalance(value: string) {
  return Number(value.replace(/[^0-9.-]/g, "")) || 0;
}

function stepIndex(step: SetupStep) {
  const index = flowSteps.indexOf(step);
  return index < 0 ? flowSteps.length : index;
}

function nextStep(step: SetupStep): SetupStep {
  return flowSteps[stepIndex(step) + 1] ?? "amount";
}

function previousStep(step: SetupStep): SetupStep {
  return flowSteps[Math.max(0, stepIndex(step) - 1)] ?? "currency";
}

export function FirstTimeSetup({
  variant,
  themeMode,
  onCancel,
  onCommit,
  onHome,
}: {
  variant: OnboardingVariant;
  themeMode: ThemeMode;
  onCancel: () => void;
  onCommit: (setup: SetupDraft) => void;
  onHome: () => void;
}) {
  const theme = themes[themeMode];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [step, setStep] = useState<SetupStep>("currency");
  const [committed, setCommitted] = useState(false);
  const [draft, setDraft] = useState<SetupDraft>({
    currency: "COP",
    notifications: null,
    // Variant D reveals sections as they complete, so its board starts empty;
    // the stepped variants keep a plausible mid-flow selection.
    categories: variant === "D" ? [] : ["Food", "Transport", "Dining", "Home"],
    categoryLooks: { ...starterLooks },
    startingAmount: "2450000",
    wantsBudgets: false,
  });

  function finish() {
    onCommit(draft);
    setCommitted(true);
    setStep("complete");
  }

  function back() {
    if (step !== "currency" && step !== "complete") {
      setStep(previousStep(step));
    }
  }

  function continueFrom(current: SetupStep) {
    if (current === "amount") {
      finish();
      return;
    }
    setStep(nextStep(current));
  }

  const state = (
    <View style={styles.prototypeState}>
      <Text style={styles.eyebrow}>PROTOTYPE STATE</Text>
      <Text style={styles.muted}>
        {variant} · {step} · Personal · {draft.currency} · notify{" "}
        {draft.notifications === null
          ? "unset"
          : draft.notifications
            ? "yes"
            : "no"}{" "}
        ·{" "}
        {draft.categories
          .map((name) =>
            draft.categoryLooks[name]
              ? `${draft.categoryLooks[name].emoji}${name}`
              : name,
          )
          .join(", ") || "none"}{" "}
        · {draft.startingAmount} ·{" "}
        {draft.wantsBudgets ? "wants budgets" : "level 0"} ·{" "}
        {committed ? "committed" : "draft"}
      </Text>
    </View>
  );

  const framed = (content: ReactNode) => (
    <View style={styles.frame}>{content}</View>
  );

  const shared = {
    step,
    draft,
    styles,
    theme,
    themeMode,
    state,
    onDraft: setDraft,
    onCancel,
    onBack: back,
    onContinue: () => continueFrom(step),
    onFinish: finish,
    onHome,
  };

  if (variant === "B") {
    return framed(<VariantB {...shared} />);
  }
  if (variant === "C") {
    return framed(<VariantC {...shared} />);
  }
  if (variant === "D") {
    return framed(<VariantD {...shared} />);
  }
  return framed(<VariantA {...shared} />);
}

type VariantProps = {
  step: SetupStep;
  draft: SetupDraft;
  styles: Styles;
  theme: Theme;
  themeMode: ThemeMode;
  state: ReactNode;
  onDraft: (draft: SetupDraft) => void;
  onCancel: () => void;
  onBack: () => void;
  onContinue: () => void;
  onFinish: () => void;
  onHome: () => void;
};

function canContinue(step: SetupStep, draft: SetupDraft) {
  if (step === "notifications") {
    return draft.notifications !== null;
  }
  if (step === "categories") {
    return draft.categories.length > 0;
  }
  return true;
}

function VariantA({
  step,
  draft,
  styles,
  theme,
  state,
  onDraft,
  onCancel,
  onBack,
  onContinue,
  onFinish,
  onHome,
}: VariantProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "complete" ? (
          <Completion draft={draft} styles={styles} theme={theme} onHome={onHome} />
        ) : (
          <>
            <Header
              title={titleFor(step)}
              eyebrow={`SETUP · ${stepIndex(step) + 1} OF 4`}
              onBack={step === "currency" ? undefined : onBack}
              styles={styles}
              theme={theme}
            />
            <Text style={styles.lede}>{ledeFor(step)}</Text>
            <StepBody
              step={step}
              draft={draft}
              styles={styles}
              theme={theme}
              onDraft={onDraft}
            />
            <PrimaryButton
              label={step === "amount" ? "Start tracking" : "Continue"}
              icon={step === "amount" ? "checkmark" : "arrow-forward"}
              disabled={!canContinue(step, draft)}
              onPress={step === "amount" ? onFinish : onContinue}
              styles={styles}
            />
            <BudgetShortcut draft={draft} onDraft={onDraft} styles={styles} />
            <SecondaryButton label="Cancel" onPress={onCancel} styles={styles} />
            {state}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VariantB({
  step,
  draft,
  styles,
  theme,
  state,
  onDraft,
  onCancel,
  onBack,
  onContinue,
  onFinish,
  onHome,
}: VariantProps) {
  if (step === "complete") {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.page}>
          <Completion draft={draft} styles={styles} theme={theme} onHome={onHome} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const tapAdvances = step === "currency" || step === "notifications";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.bleed}>
        <View style={styles.bleedBar}>
          {step === "currency" ? (
            <View style={styles.iconButtonSpacer} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPressIn={lightTap}
              onPress={onBack}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={24} color={theme.foreground} />
            </Pressable>
          )}
          <StepDots step={step} styles={styles} theme={theme} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel setup"
            onPressIn={lightTap}
            onPress={onCancel}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={theme.foreground} />
          </Pressable>
        </View>

        {tapAdvances ? (
          <View style={styles.splitColumn}>
            <Text style={styles.bleedQuestion}>{shortTitleFor(step)}</Text>
            {step === "currency" && (
              <>
                <SplitChoice
                  label="COP"
                  detail="Colombian peso"
                  icon="cash-outline"
                  styles={styles}
                  theme={theme}
                  onPress={() => {
                    onDraft({ ...draft, currency: "COP" });
                    onContinue();
                  }}
                />
                <SplitChoice
                  label="USD"
                  detail="US dollar"
                  icon="card-outline"
                  styles={styles}
                  theme={theme}
                  onPress={() => {
                    onDraft({ ...draft, currency: "USD" });
                    onContinue();
                  }}
                />
              </>
            )}
            {step === "notifications" && (
              <>
                <SplitChoice
                  label="Yes, use them"
                  detail="Purchase alerts become drafts you confirm"
                  icon="notifications-outline"
                  styles={styles}
                  theme={theme}
                  onPress={() => {
                    onDraft({ ...draft, notifications: true });
                    onContinue();
                  }}
                />
                <SplitChoice
                  label="Not now"
                  detail="You can add drafts yourself"
                  icon="create-outline"
                  styles={styles}
                  theme={theme}
                  onPress={() => {
                    onDraft({ ...draft, notifications: false });
                    onContinue();
                  }}
                />
              </>
            )}
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.bleedAccount}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.bleedQuestion}>{shortTitleFor(step)}</Text>
            <Text style={styles.lede}>{ledeFor(step)}</Text>
            <StepBody
              step={step}
              draft={draft}
              styles={styles}
              theme={theme}
              onDraft={onDraft}
            />
            <PrimaryButton
              label={step === "amount" ? "Start tracking" : "Continue"}
              icon={step === "amount" ? "checkmark" : "arrow-forward"}
              disabled={!canContinue(step, draft)}
              onPress={step === "amount" ? onFinish : onContinue}
              styles={styles}
            />
            <BudgetShortcut draft={draft} onDraft={onDraft} styles={styles} />
          </ScrollView>
        )}
        {state}
      </View>
    </SafeAreaView>
  );
}

function VariantC({
  step,
  draft,
  styles,
  theme,
  state,
  onDraft,
  onCancel,
  onBack,
  onContinue,
  onFinish,
  onHome,
}: VariantProps) {
  if (step === "complete") {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.page}>
          <Completion draft={draft} styles={styles} theme={theme} onHome={onHome} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const amountLabel =
    step === "currency"
      ? "—"
      : step === "amount"
        ? money(parseBalance(draft.startingAmount), draft.currency)
        : `${draft.currency} —`;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.destination}>
        <View style={styles.ghostHome}>
          <Text style={styles.eyebrow}>THIS MONTH</Text>
          <Text style={styles.ghostAmount}>{amountLabel}</Text>
          <View style={styles.ghostMeta}>
            {step !== "currency" && (
              <Text style={styles.ghostChip}>{draft.currency}</Text>
            )}
            {draft.notifications !== null && (
              <Text style={styles.ghostChip}>
                {draft.notifications ? "Drafts from alerts" : "Manual drafts"}
              </Text>
            )}
          </View>
          {step !== "amount" && (
            <View style={styles.ghostTile}>
              <Text style={styles.ghostTileLabel}>Drafts</Text>
            </View>
          )}
          {draft.categories.length > 0 && step !== "currency" && (
            <View style={styles.ghostAccount}>
              <Text style={styles.rowTitle}>Top categories</Text>
              <Text style={styles.muted}>
                {draft.categories.slice(0, 4).join(" · ")}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.dock}>
          <View style={styles.dockBar}>
            <Pressable
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={step === "currency" ? onCancel : onBack}
              style={styles.dockTextButton}
            >
              <Text style={styles.dockText}>
                {step === "currency" ? "Cancel" : "Back"}
              </Text>
            </Pressable>
            <Text style={styles.eyebrow}>{`${stepIndex(step) + 1} OF 4`}</Text>
            {step === "currency" ? (
              <View style={styles.dockTextButton} />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPressIn={lightTap}
                onPress={onCancel}
                style={styles.dockTextButton}
              >
                <Text style={styles.dockText}>Cancel</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.dockQuestion}>{titleFor(step)}</Text>
          <StepBody
            step={step}
            draft={draft}
            styles={styles}
            theme={theme}
            onDraft={onDraft}
            compact
            onPickAndGo={(next) => {
              onDraft(next);
              if (step === "currency" || step === "notifications") {
                onContinue();
              }
            }}
          />
          {(step === "categories" || step === "amount") && (
            <PrimaryButton
              label={step === "amount" ? "Start tracking" : "Continue"}
              icon={step === "amount" ? "checkmark" : "arrow-forward"}
              disabled={!canContinue(step, draft)}
              onPress={step === "amount" ? onFinish : onContinue}
              styles={styles}
            />
          )}
          <BudgetShortcut draft={draft} onDraft={onDraft} styles={styles} />
          {state}
        </View>
      </View>
    </SafeAreaView>
  );
}

// Variant D, "One sheet": all four answers on one scrolling surface, no
// steps, revealed in sequence. The board opens alone (header 1, board 2 =
// 2 groups); completing a section pulls in the next below it: first pick
// reveals currency (3), a currency choice reveals purchase alerts (4), the
// alerts choice reveals starting amount, start action, and the budget
// shortcut (5–7). Never more than 7 groups, and only after everything is
// answered. Reveals never retract (high-water mark), so deselecting the
// last category disables Start instead of collapsing the sheet. Currency is
// one row that opens a search sheet (search + list = 2 groups), because a
// dropdown select cannot carry 50+ currencies on a phone. Restyling a
// category is progressive disclosure: a long-press opens a sheet that is
// its own surface (preview, name when creating, quick emoji row plus an
// any-emoji keyboard field, color strip, commit = 5 groups).
function VariantD({
  step,
  draft,
  styles,
  theme,
  themeMode,
  state,
  onDraft,
  onCancel,
  onFinish,
  onHome,
}: VariantProps) {
  const [sheet, setSheet] = useState<RestyleTarget | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [currencyChosen, setCurrencyChosen] = useState(false);
  const [maxStage, setMaxStage] = useState(1);
  const scrollRef = useRef<ScrollView>(null);

  function advance(stage: number) {
    setMaxStage((current) => Math.max(current, stage));
  }

  function draftAndReveal(next: SetupDraft) {
    onDraft(next);
    if (next.categories.length > 0) {
      advance(2);
    }
    if (next.notifications !== null) {
      advance(4);
    }
  }

  useEffect(() => {
    if (maxStage === 1) {
      return;
    }
    const id = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      60,
    );
    return () => clearTimeout(id);
  }, [maxStage]);

  if (step === "complete") {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.page}>
          <Completion
            draft={draft}
            styles={styles}
            theme={theme}
            themeMode={themeMode}
            onHome={onHome}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const extras = draft.categories.filter(
    (name) => !starterCategories.includes(name),
  );
  const names = [...starterCategories, ...extras];
  const missing =
    draft.categories.length === 0
      ? "Pick at least one category to start"
      : null;

  function toggle(name: string) {
    const selected = draft.categories.includes(name);
    if (selected) {
      draftAndReveal({
        ...draft,
        categories: draft.categories.filter((item) => item !== name),
      });
      return;
    }
    if (draft.categories.length >= 12) {
      return;
    }
    draftAndReveal({ ...draft, categories: [...draft.categories, name] });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sheetPageHeader}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>SETUP · ONE SHEET</Text>
            <Text style={styles.pageTitle}>Where does your money go?</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel setup"
            onPressIn={lightTap}
            onPress={onCancel}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={theme.foreground} />
          </Pressable>
        </View>

        <View style={styles.board}>
          <View style={styles.boardHead}>
            <Text style={styles.fieldLabel}>Your categories</Text>
            <Text style={styles.muted}>{draft.categories.length} of 12</Text>
          </View>
          <View style={styles.chipRow}>
            {names.map((name) => {
              const look = draft.categoryLooks[name] ?? fallbackLook;
              const color = paletteColor(look.color, themeMode);
              const selected = draft.categories.includes(name);
              return (
                <Pressable
                  key={name}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityHint="Long press to restyle"
                  onPressIn={lightTap}
                  onPress={() => toggle(name)}
                  onLongPress={() => setSheet({ mode: "edit", name })}
                  style={[
                    styles.lookChip,
                    selected && {
                      backgroundColor: `${color}24`,
                      borderColor: color,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <Text style={styles.lookChipEmoji}>{look.emoji}</Text>
                  <Text style={styles.chipText}>{name}</Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add your own category"
              onPressIn={lightTap}
              onPress={() => setSheet({ mode: "create" })}
              style={({ pressed }) => [
                styles.lookChip,
                styles.ownChip,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="add" size={18} color={theme.foreground} />
              <Text style={styles.chipText}>Your own</Text>
            </Pressable>
          </View>
          <Text style={styles.muted}>Tap to pick. Hold one to restyle it.</Text>
        </View>

        {maxStage >= 2 && (
          <View style={styles.board}>
            <View style={styles.boardHead}>
              <Text style={styles.fieldLabel}>Currency</Text>
              {currencyChosen && (
                <Text style={styles.muted}>{currencyName(draft.currency)}</Text>
              )}
            </View>
            <View style={styles.chipRow}>
              {commonCurrencies.map((code) => {
                const selected = currencyChosen && draft.currency === code;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPressIn={lightTap}
                    onPress={() => {
                      onDraft({ ...draft, currency: code });
                      setCurrencyChosen(true);
                      advance(3);
                    }}
                    style={[
                      styles.lookChip,
                      selected && styles.lookChipSelected,
                    ]}
                  >
                    <Text style={styles.chipText}>{code}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More currencies"
                onPressIn={lightTap}
                onPress={() => setCurrencyOpen(true)}
                style={({ pressed }) => [
                  styles.lookChip,
                  styles.ownChip,
                  currencyChosen &&
                    !commonCurrencies.includes(draft.currency) &&
                    styles.lookChipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.chipText}>
                  {currencyChosen && !commonCurrencies.includes(draft.currency)
                    ? draft.currency
                    : "More"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {maxStage >= 3 && (
          <View style={styles.board}>
            <Text style={styles.fieldLabel}>Purchase alerts</Text>
            <View style={styles.notifyRow}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: draft.notifications === true }}
                onPressIn={lightTap}
                onPress={() =>
                  draftAndReveal({ ...draft, notifications: true })
                }
                style={[
                  styles.notifyCard,
                  draft.notifications === true && styles.lookChipSelected,
                ]}
              >
                <Text style={styles.lookChipEmoji}>🔔</Text>
                <Text style={styles.rowTitle}>Use them</Text>
                <Text style={styles.muted}>
                  Alerts become drafts you confirm
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: draft.notifications === false }}
                onPressIn={lightTap}
                onPress={() =>
                  draftAndReveal({ ...draft, notifications: false })
                }
                style={[
                  styles.notifyCard,
                  draft.notifications === false && styles.lookChipSelected,
                ]}
              >
                <Text style={styles.lookChipEmoji}>✍️</Text>
                <Text style={styles.rowTitle}>Not now</Text>
                <Text style={styles.muted}>You add drafts yourself</Text>
              </Pressable>
            </View>
          </View>
        )}

        {maxStage >= 4 && (
          <>
            <View style={styles.board}>
              <Text style={styles.fieldLabel}>What you have now</Text>
              <TextInput
                accessibilityLabel="Starting amount"
                value={draft.startingAmount}
                onChangeText={(startingAmount) =>
                  onDraft({ ...draft, startingAmount })
                }
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.mutedForeground}
                style={styles.amountHero}
              />
              <Text style={styles.muted}>
                {money(parseBalance(draft.startingAmount), draft.currency)}. Bank
                plus the cash in your pocket.
              </Text>
            </View>

            <PrimaryButton
              label="Start tracking"
              icon="checkmark"
              disabled={missing !== null}
              onPress={onFinish}
              styles={styles}
            />
            {missing && <Text style={styles.startHint}>{missing}</Text>}
            <BudgetShortcut draft={draft} onDraft={onDraft} styles={styles} />
          </>
        )}
        {state}
      </ScrollView>
      {sheet && (
        <RestyleSheet
          key={sheet.mode === "edit" ? sheet.name : "create"}
          target={sheet}
          draft={draft}
          styles={styles}
          theme={theme}
          themeMode={themeMode}
          onDraft={draftAndReveal}
          onClose={() => setSheet(null)}
        />
      )}
      {currencyOpen && (
        <CurrencySheet
          selected={currencyChosen ? draft.currency : null}
          styles={styles}
          theme={theme}
          onSelect={(currency) => {
            onDraft({ ...draft, currency });
            setCurrencyChosen(true);
            advance(3);
            setCurrencyOpen(false);
          }}
          onClose={() => setCurrencyOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

function CurrencySheet({
  selected,
  styles,
  theme,
  onSelect,
  onClose,
}: {
  selected: Currency | null;
  styles: Styles;
  theme: Theme;
  onSelect: (currency: Currency) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? currencyOptions.filter(
        (entry) =>
          entry.code.toLowerCase().includes(needle) ||
          entry.name.toLowerCase().includes(needle),
      )
    : [
        ...currencyOptions.filter((entry) =>
          commonCurrencies.includes(entry.code),
        ),
        ...currencyOptions.filter(
          (entry) => !commonCurrencies.includes(entry.code),
        ),
      ];

  return (
    <BottomSheet
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderSheetBackdrop}
      snapPoints={["70%"]}
      enableDynamicSizing={false}
      backgroundStyle={styles.sheetSurface}
      handleIndicatorStyle={styles.sheetHandle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.sheetListContent}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
      >
        <View style={styles.sheetSearchWrap}>
          <SheetTextInput
            accessibilityLabel="Search currencies"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by code or name"
            placeholderTextColor={theme.mutedForeground}
            style={styles.input}
          />
        </View>
        {matches.map((entry) => (
          <Pressable
            key={entry.code}
            accessibilityRole="button"
            onPressIn={lightTap}
            onPress={() => onSelect(entry.code)}
            style={({ pressed }) => [
              styles.currencyItem,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.rowTitle}>{entry.code}</Text>
            <Text style={[styles.muted, styles.currencyItemName]}>
              {entry.name}
            </Text>
            {selected === entry.code && (
              <Ionicons name="checkmark" size={20} color={theme.primary} />
            )}
          </Pressable>
        ))}
        {matches.length === 0 && (
          <Text style={styles.muted}>{`Nothing matches "${query.trim()}".`}</Text>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

export type RestyleTarget = { mode: "create" } | { mode: "edit"; name: string };

export function renderSheetBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
    />
  );
}

export function RestyleSheet({
  target,
  draft,
  styles,
  theme,
  themeMode,
  onDraft,
  onClose,
}: {
  target: RestyleTarget;
  draft: SetupDraft;
  styles: Styles;
  theme: Theme;
  themeMode: ThemeMode;
  onDraft: (draft: SetupDraft) => void;
  onClose: () => void;
}) {
  const editing = target.mode === "edit" ? target.name : null;
  const [name, setName] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [look, setLook] = useState<CategoryLook>(
    editing ? (draft.categoryLooks[editing] ?? fallbackLook) : fallbackLook,
  );

  const trimmed = name.trim();
  const createBlocked =
    !editing &&
    (!trimmed ||
      draft.categories.includes(trimmed) ||
      draft.categories.length >= 12);
  const color = paletteColor(look.color, themeMode);

  function commit() {
    if (editing) {
      onDraft({
        ...draft,
        categoryLooks: { ...draft.categoryLooks, [editing]: look },
      });
    } else {
      onDraft({
        ...draft,
        categories: [...draft.categories, trimmed],
        categoryLooks: { ...draft.categoryLooks, [trimmed]: look },
      });
    }
    onClose();
  }

  return (
    <BottomSheet
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderSheetBackdrop}
      backgroundStyle={styles.sheetSurface}
      handleIndicatorStyle={styles.sheetHandle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={styles.sheetBody}>
        <View style={styles.sheetPreviewRow}>
          <View
            style={[
              styles.lookChip,
              { backgroundColor: `${color}24`, borderColor: color, borderWidth: 2 },
            ]}
          >
            <Text style={styles.lookChipEmoji}>{look.emoji}</Text>
            <Text style={styles.chipText}>
              {editing ?? (trimmed || "Your own")}
            </Text>
          </View>
        </View>
        {!editing && (
          <SheetTextInput
            accessibilityLabel="Category name"
            value={name}
            onChangeText={setName}
            placeholder="Name it your way"
            placeholderTextColor={theme.mutedForeground}
            style={styles.input}
            autoFocus
          />
        )}
        <View style={styles.emojiGroup}>
          <View style={styles.emojiGrid}>
            {quickEmojis.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="radio"
                accessibilityLabel={`Emoji ${emoji}`}
                accessibilityState={{ selected: look.emoji === emoji }}
                onPressIn={lightTap}
                onPress={() => setLook({ ...look, emoji })}
                style={[
                  styles.emojiCell,
                  look.emoji === emoji && {
                    backgroundColor: `${color}24`,
                    borderColor: color,
                    borderWidth: 2,
                  },
                ]}
              >
                <Text style={styles.emojiCellText}>{emoji}</Text>
              </Pressable>
            ))}
            {keyOpen ? (
              <SheetTextInput
                accessibilityLabel="Type any emoji"
                autoFocus
                value=""
                onChangeText={(text) => {
                  const emoji = emojiFrom(text);
                  if (emoji) {
                    setLook({ ...look, emoji });
                    setKeyOpen(false);
                  }
                }}
                onBlur={() => setKeyOpen(false)}
                style={[
                  styles.emojiCell,
                  styles.emojiCellInput,
                  { borderColor: color, borderWidth: 2 },
                ]}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pick any emoji from your keyboard"
                onPressIn={lightTap}
                onPress={() => setKeyOpen(true)}
                style={({ pressed }) => [
                  styles.emojiCell,
                  styles.emojiCellPlus,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="add" size={22} color={theme.foreground} />
              </Pressable>
            )}
          </View>
          {keyOpen && (
            <Text style={styles.muted}>
              Pick an emoji from your phone keyboard.
            </Text>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.swatchStrip}
        >
          {categoryPalette.map((entry) => {
            const swatch = entry[themeMode];
            const active = look.color === entry.id;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="radio"
                accessibilityLabel={`Color ${entry.id}`}
                accessibilityState={{ selected: active }}
                onPressIn={lightTap}
                onPress={() => setLook({ ...look, color: entry.id })}
                style={[styles.swatch, active && { borderColor: swatch }]}
              >
                <View style={[styles.swatchDot, { backgroundColor: swatch }]} />
              </Pressable>
            );
          })}
        </ScrollView>
        <PrimaryButton
          label={editing ? "Done" : "Add category"}
          icon="checkmark"
          disabled={createBlocked}
          onPress={commit}
          styles={styles}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}

function titleFor(step: SetupStep) {
  if (step === "currency") return "What's your main currency?";
  if (step === "notifications") return "Turn purchases into drafts?";
  if (step === "categories") return "Where does your money go?";
  return "Roughly, what do you have right now?";
}

function shortTitleFor(step: SetupStep) {
  if (step === "currency") return "Main currency";
  if (step === "notifications") return "Purchase alerts";
  if (step === "categories") return "Your categories";
  return "What you have";
}

function ledeFor(step: SetupStep) {
  if (step === "currency") return "Balances will use this.";
  if (step === "notifications") {
    return "Want your purchase notifications to become drafts you confirm? Declining is fine.";
  }
  if (step === "categories") {
    return "Name the spend categories in your head. About ten is enough.";
  }
  return "One number. We start from here today.";
}

function StepBody({
  step,
  draft,
  styles,
  theme,
  onDraft,
  compact = false,
  onPickAndGo,
}: {
  step: SetupStep;
  draft: SetupDraft;
  styles: Styles;
  theme: Theme;
  onDraft: (draft: SetupDraft) => void;
  compact?: boolean;
  onPickAndGo?: (draft: SetupDraft) => void;
}) {
  if (step === "currency") {
    return (
      <View style={compact ? styles.dockChoices : styles.choiceGroup}>
        {(["COP", "USD"] as const).map((currency) =>
          compact ? (
            <Pressable
              key={currency}
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={() =>
                (onPickAndGo ?? onDraft)({ ...draft, currency })
              }
              style={({ pressed }) => [
                styles.dockChoice,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.dockChoiceText}>{currency}</Text>
            </Pressable>
          ) : (
            <Choice
              key={currency}
              label={currencyCopy[currency].label}
              detail={currencyCopy[currency].detail}
              selected={draft.currency === currency}
              onPress={() => onDraft({ ...draft, currency })}
              styles={styles}
              theme={theme}
            />
          ),
        )}
      </View>
    );
  }

  if (step === "notifications") {
    const options = [
      {
        value: true,
        label: "Yes, use them",
        detail: "Purchase alerts become drafts you confirm",
      },
      {
        value: false,
        label: "Not now",
        detail: "You can add drafts yourself",
      },
    ] as const;
    return (
      <View style={compact ? styles.choiceGroup : styles.choiceGroup}>
        {options.map((option) => (
          <Choice
            key={String(option.value)}
            label={option.label}
            detail={option.detail}
            selected={draft.notifications === option.value}
            onPress={() =>
              (onPickAndGo ?? onDraft)({
                ...draft,
                notifications: option.value,
              })
            }
            styles={styles}
            theme={theme}
          />
        ))}
      </View>
    );
  }

  if (step === "categories") {
    return (
      <CategoryPicker
        draft={draft}
        styles={styles}
        theme={theme}
        onDraft={onDraft}
      />
    );
  }

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>What you have now</Text>
      <TextInput
        accessibilityLabel="Starting amount"
        value={draft.startingAmount}
        onChangeText={(startingAmount) => onDraft({ ...draft, startingAmount })}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={theme.mutedForeground}
        style={styles.input}
      />
      <Text style={styles.muted}>
        {money(parseBalance(draft.startingAmount), draft.currency)}
      </Text>
    </View>
  );
}

function CategoryPicker({
  draft,
  styles,
  theme,
  onDraft,
}: {
  draft: SetupDraft;
  styles: Styles;
  theme: Theme;
  onDraft: (draft: SetupDraft) => void;
}) {
  const [custom, setCustom] = useState("");
  const extras = draft.categories.filter(
    (name) => !starterCategories.includes(name),
  );
  const names = [...starterCategories, ...extras];

  function toggle(name: string) {
    const selected = draft.categories.includes(name);
    if (selected) {
      onDraft({
        ...draft,
        categories: draft.categories.filter((item) => item !== name),
      });
      return;
    }
    if (draft.categories.length >= 12) {
      return;
    }
    onDraft({ ...draft, categories: [...draft.categories, name] });
  }

  function addCustom() {
    const name = custom.trim();
    if (!name || draft.categories.includes(name) || draft.categories.length >= 12) {
      return;
    }
    onDraft({ ...draft, categories: [...draft.categories, name] });
    setCustom("");
  }

  return (
    <View style={styles.fieldStack}>
      <View style={styles.chipRow}>
        {names.map((name) => {
          const selected = draft.categories.includes(name);
          return (
            <Pressable
              key={name}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPressIn={lightTap}
              onPress={() => toggle(name)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={styles.chipText}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel="Add your own category"
          value={custom}
          onChangeText={setCustom}
          placeholder="Add your own"
          placeholderTextColor={theme.mutedForeground}
          style={[styles.input, styles.addInput]}
          onSubmitEditing={addCustom}
        />
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={addCustom}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>
        {draft.categories.length} of 12 · {draft.categories.join(", ") || "none yet"}
      </Text>
    </View>
  );
}

function BudgetShortcut({
  draft,
  onDraft,
  styles,
}: {
  draft: SetupDraft;
  onDraft: (draft: SetupDraft) => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: draft.wantsBudgets }}
      onPressIn={lightTap}
      onPress={() => onDraft({ ...draft, wantsBudgets: !draft.wantsBudgets })}
      style={styles.shortcut}
    >
      <Text style={styles.shortcutText}>
        {draft.wantsBudgets
          ? "You want budgets. That door opens after this."
          : "I already know my spending. I want budgets."}
      </Text>
    </Pressable>
  );
}

function Completion({
  draft,
  styles,
  theme,
  themeMode = "light",
  onHome,
}: {
  draft: SetupDraft;
  styles: Styles;
  theme: Theme;
  themeMode?: ThemeMode;
  onHome: () => void;
}) {
  return (
    <View style={styles.completion}>
      <View style={styles.completionIcon}>
        <Ionicons name="checkmark" size={32} color={theme.primaryForeground} />
      </View>
      <Text style={styles.completionTitle}>{"You're set"}</Text>
      <View style={styles.chipRow}>
        {draft.categories.slice(0, 6).map((name) => {
          const look = draft.categoryLooks[name] ?? fallbackLook;
          const color = paletteColor(look.color, themeMode);
          return (
            <View
              key={name}
              style={[
                styles.lookChip,
                { backgroundColor: `${color}24`, borderColor: color, borderWidth: 2 },
              ]}
            >
              <Text style={styles.lookChipEmoji}>{look.emoji}</Text>
              <Text style={styles.chipText}>{name}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.completionCopy}>
        {currencyName(draft.currency)}, starting from{" "}
        {money(parseBalance(draft.startingAmount), draft.currency)}. Tracking{" "}
        {draft.categories.slice(0, 3).join(", ")}
        {draft.categories.length > 3
          ? ` and ${draft.categories.length - 3} more`
          : ""}
        .{" "}
        {draft.notifications
          ? "Purchase alerts can become drafts."
          : "You will add drafts yourself."}
        {draft.wantsBudgets ? " Budgets stay one door away." : ""}
      </Text>
      <PrimaryButton
        label="Go to home"
        icon="home-outline"
        onPress={onHome}
        styles={styles}
      />
      <Text style={styles.prototypeNote}>
        Prototype only · My money is created silently
      </Text>
    </View>
  );
}

function Header({
  title,
  eyebrow,
  onBack,
  styles,
  theme,
}: {
  title: string;
  eyebrow: string;
  onBack?: () => void;
  styles: Styles;
  theme: Theme;
}) {
  return (
    <View style={styles.pageHeader}>
      {onBack && (
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
      )}
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.pageTitle}>{title}</Text>
      </View>
    </View>
  );
}

function Choice({
  label,
  detail,
  selected,
  styles,
  theme,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  styles: Styles;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={24}
        color={selected ? theme.primary : theme.mutedForeground}
      />
    </Pressable>
  );
}

function SplitChoice({
  label,
  detail,
  icon,
  styles,
  theme,
  onPress,
}: {
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  styles: Styles;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [styles.splitTile, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={28} color={theme.foreground} />
      <Text style={styles.splitTitle}>{label}</Text>
      <Text style={styles.muted}>{detail}</Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  styles,
  onPress,
  disabled = false,
  icon = "arrow-forward",
}: {
  label: string;
  styles: Styles;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Ionicons name={icon} size={20} color="#f5f3ff" />
    </Pressable>
  );
}

function SecondaryButton({
  label,
  styles,
  onPress,
}: {
  label: string;
  styles: Styles;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function StepDots({
  step,
  styles,
  theme,
}: {
  step: SetupStep;
  styles: Styles;
  theme: Theme;
}) {
  const index = stepIndex(step);
  return (
    <View style={styles.dots}>
      {flowSteps.map((_, dot) => (
        <View
          key={dot}
          style={[
            styles.dot,
            { backgroundColor: dot === index ? theme.primary : theme.border },
          ]}
        />
      ))}
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    frame: { flex: 1 },
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
    lede: {
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
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
    iconButtonSpacer: { width: touchTarget, height: touchTarget },
    choiceGroup: { gap: spacing.md },
    choice: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    choiceSelected: { borderColor: theme.primary, borderWidth: 2 },
    rowCopy: { flex: 1, gap: spacing.xs },
    rowTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    muted: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    fieldStack: { gap: spacing.lg },
    fieldGroup: { gap: spacing.sm },
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
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
    addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
    addInput: { flex: 1 },
    addButton: {
      minHeight: touchTarget,
      minWidth: 72,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    addButtonText: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.bold,
    },
    shortcut: {
      minHeight: touchTarget,
      justifyContent: "center",
    },
    shortcutText: {
      color: theme.primary,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: font.semibold,
      textAlign: "center",
    },
    primaryButton: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
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
      minHeight: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    secondaryButtonText: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    completion: {
      flex: 1,
      minHeight: 560,
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xl,
    },
    completionIcon: {
      width: 68,
      height: 68,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primary,
    },
    completionTitle: {
      color: theme.foreground,
      fontSize: 30,
      lineHeight: 36,
      fontFamily: font.extrabold,
      textAlign: "center",
    },
    completionCopy: {
      maxWidth: 340,
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
      textAlign: "center",
    },
    prototypeNote: {
      color: theme.mutedForeground,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: font.regular,
      textAlign: "center",
    },
    prototypeState: {
      gap: spacing.sm,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    bleed: {
      flex: 1,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      paddingBottom: 100,
      gap: spacing.lg,
    },
    bleedBar: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    bleedQuestion: {
      color: theme.foreground,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: font.extrabold,
      letterSpacing: -0.6,
    },
    dots: { flexDirection: "row", gap: spacing.sm },
    dot: { width: 8, height: 8, borderRadius: radius.full },
    splitColumn: { flex: 1, gap: spacing.md },
    splitTile: {
      flex: 1,
      justifyContent: "center",
      gap: spacing.sm,
      padding: spacing.xl,
      borderRadius: radius.xl,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    splitTitle: {
      color: theme.foreground,
      fontSize: 24,
      lineHeight: 28,
      fontFamily: font.extrabold,
    },
    bleedAccount: { gap: spacing.xl, paddingBottom: 24 },
    destination: { flex: 1 },
    ghostHome: {
      flex: 1,
      gap: spacing.lg,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      opacity: 0.55,
    },
    ghostAmount: {
      color: theme.foreground,
      fontSize: 40,
      lineHeight: 46,
      fontFamily: font.extrabold,
      letterSpacing: -1,
      textAlign: "center",
    },
    ghostMeta: {
      flexDirection: "row",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    ghostChip: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
      overflow: "hidden",
    },
    ghostTile: {
      minHeight: 72,
      justifyContent: "flex-end",
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
    },
    ghostTileLabel: {
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.bold,
    },
    ghostAccount: {
      gap: spacing.xs,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: theme.secondary,
    },
    dock: {
      gap: spacing.md,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.lg,
      paddingBottom: 108,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
    },
    dockBar: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dockTextButton: {
      minWidth: 64,
      minHeight: 32,
      justifyContent: "center",
    },
    dockText: {
      color: theme.foreground,
      fontSize: 15,
      fontFamily: font.semibold,
    },
    dockQuestion: {
      color: theme.foreground,
      fontSize: 22,
      lineHeight: 28,
      fontFamily: font.extrabold,
    },
    dockChoices: { flexDirection: "row", gap: spacing.md },
    dockChoice: {
      flex: 1,
      minHeight: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: theme.primary,
    },
    dockChoiceText: {
      color: theme.primaryForeground,
      fontSize: fontSize.body,
      fontFamily: font.bold,
    },
    sheetPageHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    board: { gap: spacing.md },
    boardHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    lookChip: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    lookChipEmoji: { fontSize: 17 },
    lookChipSelected: {
      borderColor: theme.primary,
      borderWidth: 2,
      backgroundColor: theme.secondary,
    },
    notifyRow: { flexDirection: "row", gap: spacing.md },
    notifyCard: {
      flex: 1,
      minHeight: 120,
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    amountHero: {
      minHeight: 88,
      paddingHorizontal: spacing.sm,
      color: theme.foreground,
      fontSize: 40,
      lineHeight: 48,
      fontFamily: font.extrabold,
      letterSpacing: -1,
    },
    ownChip: { borderStyle: "dashed", backgroundColor: theme.background },
    segmentedRow: { flexDirection: "row", gap: spacing.sm },
    segmentOption: {
      flex: 1,
      minHeight: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    segmentOptionSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    segmentOptionText: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    segmentOptionTextSelected: { color: theme.primaryForeground },
    startHint: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
      textAlign: "center",
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
      gap: spacing.lg,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.sm,
      paddingBottom: 44,
    },
    sheetSearchWrap: {
      backgroundColor: theme.background,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    sheetListContent: {
      paddingHorizontal: spacing.xxl,
      paddingBottom: 44,
    },
    sheetPreviewRow: { flexDirection: "row" },
    emojiGroup: { gap: spacing.sm },
    emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    emojiCell: {
      width: touchTarget,
      height: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    emojiCellText: { fontSize: 22 },
    emojiCellInput: {
      color: theme.foreground,
      fontSize: 22,
      textAlign: "center",
      padding: 0,
    },
    emojiCellPlus: { borderStyle: "dashed" },
    swatchStrip: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingRight: spacing.lg,
    },
    currencyItem: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    currencyItemName: { flex: 1 },
    swatch: {
      width: touchTarget,
      height: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      borderWidth: 2,
      borderColor: "transparent",
    },
    swatchDot: { width: 26, height: 26, borderRadius: radius.full },
  });

export { createStyles as createSetupStyles };
export type SetupStyles = ReturnType<typeof createStyles>;
