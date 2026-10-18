import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { useAction, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { useDeviceAccessFailure } from "../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../local-auth/interaction";
import { Header, PrimaryButton, theme, ui } from "../ui/core";
import { font, radius, spacing } from "../ui/tokens";
import { api } from "./api";
import { SetupCategories } from "./categories/SetupCategories";
import { formatMoney } from "./money";
import { TimeZonePicker } from "./TimeZonePicker";
import { deviceTimeZone } from "./timeZones";
import {
  commonCurrencies,
  currencyName,
  currencyOptions,
} from "./setup/currencies";
import {
  setupSelections,
  startingAmount,
  type SetupCategory,
  type SetupSummary,
} from "./setup/model";
import { SearchSheet, SetupBackdrop } from "./setup/SearchSheet";
import { setupStyles as styles } from "./setup/styles";

type SetupRequest = FunctionArgs<typeof api.accounting.ensurePersonalDefaults>;
const setupConflict = z.object({ code: z.literal("setup_conflict") });
export function Setup({
  onComplete,
  onCancel,
}: {
  onComplete: (summary: SetupSummary) => void;
  onCancel: () => void;
}) {
  const interact = useLocalEntryInteraction();
  const reportFailure = useDeviceAccessFailure();
  const sheet = useRef<BottomSheetModal>(null);
  const scroll = useRef<BottomSheetScrollViewMethods>(null);
  const ensure = useAction(api.accounting.ensurePersonalDefaults);
  const presets = useQuery(api.accounting.listCategoryPresets, {
    nature: "Expense",
  });
  const [categories, setCategories] = useState<SetupCategory[]>([]);
  const [currency, setCurrency] = useState("COP");
  const [currencyChosen, setCurrencyChosen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [stage, setStage] = useState(1);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [timeZone, setTimeZone] = useState(deviceTimeZone);
  const [starting, setStarting] = useState("");
  const [wantsBudgets, setWantsBudgets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const completed = useRef(false);
  const request = useRef<{
    payload: SetupRequest;
    summary: SetupSummary;
  } | null>(null);
  useEffect(() => {
    sheet.current?.present();
  }, []);
  useEffect(() => {
    if (stage === 1) return;
    const timer = setTimeout(
      () => scroll.current?.scrollToEnd({ animated: true }),
      60,
    );
    return () => clearTimeout(timer);
  }, [stage]);
  function advance(next: number) {
    setStage((current) => Math.max(current, next));
  }
  const disabled = busy;
  function chooseCurrency(code: string) {
    interact();
    setCurrency(code);
    setCurrencyChosen(true);
    advance(3);
  }
  let formatted = "";
  try {
    formatted = formatMoney(
      { currency, minorUnits: startingAmount(starting) },
      { hideZeroDecimals: true },
    );
  } catch {
    /* Keep incomplete input editable. */
  }
  async function finish() {
    if (saving.current) return;
    interact();
    setError("");
    try {
      let submission = request.current;
      if (!submission) {
        if (!presets || !categories.length || !currencyChosen || consent === null)
          return;
        const startingMinorUnits = startingAmount(starting);
        submission = {
          payload: {
            functionalCurrency: currency,
            startingMinorUnits,
            categories: setupSelections(categories, presets),
            timeZone,
            purchaseAlertsConsent: consent,
            wantsBudgets,
          },
          summary: {
            categories,
            currency,
            startingMinorUnits,
            purchaseAlertsConsent: consent,
            wantsBudgets,
          },
        };
      }
      saving.current = true;
      setBusy(true);
      request.current = submission;
      const result = await ensure(submission.payload);
      completed.current = true;
      sheet.current?.dismiss();
      onComplete({
        ...submission.summary,
        firstCategoryId: result.firstCategoryId,
      });
    } catch (error) {
      if (reportFailure(error)) return;
      if (
        error instanceof ConvexError &&
        setupConflict.safeParse(error.data).success
      ) {
        request.current = null;
        setError(
          "Setup was already saved with different answers. You can edit your answers or cancel.",
        );
      } else {
        setError(
          request.current
            ? "Setup could not be confirmed. Retry with the same answers."
            : error instanceof Error
              ? error.message
              : "Setup could not finish.",
        );
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <BottomSheetModal
        ref={sheet}
        snapPoints={["96%"]}
        enableDynamicSizing={false}
        enablePanDownToClose={!disabled}
        enableContentPanningGesture={!busy}
        backdropComponent={disabled ? undefined : SetupBackdrop}
        backgroundStyle={{ backgroundColor: theme.background }}
        onDismiss={() => {
          if (!completed.current && !saving.current) {
            request.current = null;
            onCancel();
          }
        }}
      >
        <BottomSheetScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.page}
        >
          <View style={[styles.row, { alignItems: "flex-start" }]}>
            <View style={{ flex: 1 }}>
              <Header
                title="Where does your money go?"
                eyebrow="SETUP · ONE SHEET"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel setup"
              disabled={disabled}
              accessibilityState={{ disabled }}
              style={styles.icon}
              onPress={() => {
                interact();
                sheet.current?.dismiss();
              }}
            >
              <Ionicons name="close" size={22} color={theme.foreground} />
            </Pressable>
          </View>
          <SetupCategories
            selections={categories}
            disabled={disabled}
            onChange={(next) => {
              setCategories(next);
              if (next.length) advance(2);
            }}
          />
          {stage >= 2 && (
            <View style={styles.board}>
              <View style={styles.row}>
                <Text style={styles.label}>Currency</Text>
                {currencyChosen && (
                  <Text style={[ui.muted, { flex: 1, textAlign: "right" }]}>
                    {currencyName(currency)}
                  </Text>
                )}
              </View>
              <View style={styles.wrap}>
                {commonCurrencies.map((code) => (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityLabel={code}
                    accessibilityState={{
                      checked: currencyChosen && currency === code,
                      disabled,
                    }}
                    disabled={disabled}
                    onPress={() => chooseCurrency(code)}
                    style={[
                      styles.chip,
                      currencyChosen && currency === code && styles.selected,
                    ]}
                  >
                    <Text style={styles.chipText}>{code}</Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More currencies"
                  disabled={disabled}
                  onPress={() => {
                    interact();
                    setCurrencyOpen(true);
                  }}
                  style={[
                    styles.chip,
                    styles.own,
                    currencyChosen &&
                      !commonCurrencies.includes(currency) &&
                      styles.selected,
                  ]}
                >
                  <Text style={styles.chipText}>
                    {currencyChosen && !commonCurrencies.includes(currency)
                      ? currency
                      : "More"}
                  </Text>
                </Pressable>
              </View>
              <TimeZonePicker
                value={timeZone}
                disabled={disabled}
                onChange={(next) => {
                  interact();
                  setTimeZone(next);
                }}
              />
            </View>
          )}
          {stage >= 3 && (
            <View style={styles.board}>
              <Text style={styles.label}>Purchase alerts</Text>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                {[
                  {
                    value: true,
                    emoji: "🔔",
                    label: "Use them",
                    detail: "Alerts become drafts you confirm",
                  },
                  {
                    value: false,
                    emoji: "✍️",
                    label: "Not now",
                    detail: "You add drafts yourself",
                  },
                ].map((option) => (
                  <Pressable
                    key={option.label}
                    accessibilityRole="radio"
                    accessibilityLabel={`${option.label}, ${option.detail}`}
                    accessibilityState={{
                      checked: consent === option.value,
                      disabled,
                    }}
                    disabled={disabled}
                    onPress={() => {
                      interact();
                      setConsent(option.value);
                      advance(4);
                    }}
                    style={[
                      {
                        flex: 1,
                        minHeight: 120,
                        padding: spacing.lg,
                        gap: spacing.sm,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.secondary,
                      },
                      consent === option.value && styles.selected,
                    ]}
                  >
                    <Text style={{ fontSize: 17 }}>{option.emoji}</Text>
                    <Text style={ui.title}>{option.label}</Text>
                    <Text style={ui.muted}>{option.detail}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {stage >= 4 && (
            <>
              <View style={styles.board}>
                <Text style={styles.label}>What you have now</Text>
                <BottomSheetTextInput
                  accessibilityLabel="Starting amount"
                  value={starting}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.mutedForeground}
                  editable={!disabled}
                  onChangeText={(value) => {
                    interact();
                    setStarting(value);
                  }}
                  style={{
                    minHeight: 88,
                    paddingHorizontal: spacing.sm,
                    color: theme.foreground,
                    fontSize: 40,
                    lineHeight: 48,
                    fontFamily: font.extrabold,
                    letterSpacing: -1,
                  }}
                />
                <Text style={ui.muted}>
                  {formatted ? `${formatted}. ` : ""}Bank plus the cash in your
                  pocket.
                </Text>
              </View>
              {error ? (
                <Text accessibilityRole="alert" style={ui.error}>
                  {error}
                </Text>
              ) : null}
              <PrimaryButton
                label="Start tracking"
                trailingIcon="checkmark"
                pending={busy}
                disabled={!request.current && (!categories.length || !presets)}
                onPress={() => void finish()}
              />
              {!categories.length && (
                <Text style={[ui.muted, { textAlign: "center" }]}>
                  Pick at least one category to start
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  wantsBudgets
                    ? "You want budgets. That door opens after this."
                    : "I already know my spending. I want budgets."
                }
                accessibilityState={{ selected: wantsBudgets, disabled }}
                disabled={disabled}
                onPress={() => {
                  interact();
                  setWantsBudgets((value) => !value);
                }}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  padding: spacing.md,
                }}
              >
                <Text
                  style={[
                    ui.body,
                    {
                      fontFamily: font.semibold,
                      color: theme.primary,
                      textAlign: "center",
                    },
                  ]}
                >
                  {wantsBudgets
                    ? "You want budgets. That door opens after this."
                    : "I already know my spending. I want budgets."}
                </Text>
              </Pressable>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
      {currencyOpen && (
        <SearchSheet
          label="Search currencies"
          placeholder="Search by code or name"
          options={currencyOptions}
          selected={currencyChosen ? currency : null}
          onSelect={chooseCurrency}
          onClose={() => setCurrencyOpen(false)}
        />
      )}
    </>
  );
}
