import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { useAction, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { formatList, useT } from "../i18n";
import { useDeviceAccessFailure } from "../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../local-auth/interaction";
import { Header, PrimaryButton, useTheme, useUi } from "../ui/core";
import { useReadableLayout } from "../ui/themeContext";
import { font, radius, spacing } from "../ui/tokens";
import { api } from "./api";
import { DeferredAccountSetup } from "./setup/DeferredAccountSetup";
import type { AccountSetupRequest } from "./categories/model";
import { SetupCategories } from "./categories/SetupCategories";
import { formatMoney } from "./money";
import { AmountField } from "./amount/AmountField";
import { displayedMinorUnits, openAmount } from "./amount/session";
import { useAmountState, useFormState, withFields, type ReadAtPress } from "./amount/useAmountState";
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
import { useSetupStyles } from "./setup/styles";

type SetupRequest = FunctionArgs<typeof api.accounting.ensurePersonalDefaults>;
type SetupSubmission = {
  payload: SetupRequest;
  summary: SetupSummary;
  accounts: AccountSetupRequest[];
};
type SetupPhase =
  | { kind: "editing" }
  | { kind: "savingDefaults" | "retryDefaults"; submission: SetupSubmission }
  | {
      kind: "accounts";
      result: FunctionReturnType<typeof api.accounting.ensurePersonalDefaults>;
      summary: SetupSummary;
      requests: AccountSetupRequest[];
      index: number;
    };
/** The first-run answers Finish builds its save from, read once at the press. */
type SetupAnswers = {
  categories: SetupCategory[];
  accountRequests: AccountSetupRequest[];
  currency: string;
  currencyChosen: boolean;
  consent: boolean | null;
  timeZone: string;
  wantsBudgets: boolean;
};
/** Where the save stands: a held submission is resent as it was built. */
type SetupRun = { phase: SetupPhase; busy: boolean };
/** The held submission as it was built; a press reads it through a read-only view of the same plain data. */
function heldSubmission(phase: ReadAtPress<SetupPhase>): SetupSubmission | null {
  return phase.kind === "retryDefaults" ? phase.submission as SetupSubmission : null;
}
const setupConflict = z.object({ code: z.literal("setup_conflict") });
export function Setup({
  onComplete,
  onCancel,
  subject,
}: {
  onComplete: (summary: SetupSummary) => void;
  onCancel: () => void;
  subject: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const ui = useUi();
  const styles = useSetupStyles();
  const layout = useReadableLayout();
  const translator = useT();
  const { t } = translator;
  const interact = useLocalEntryInteraction();
  const reportFailure = useDeviceAccessFailure();
  const sheet = useRef<BottomSheetModal>(null);
  const scroll = useRef<BottomSheetScrollViewMethods>(null);
  const ensure = useAction(api.accounting.ensurePersonalDefaults);
  const presets = useQuery(api.accounting.listCategoryPresets, {
    nature: "Expense",
  });
  const [answers, setAnswers, readAnswers] = useFormState<SetupAnswers>(() => ({
    categories: [], accountRequests: [], currency: "COP", currencyChosen: false, consent: null, timeZone: deviceTimeZone(),
    wantsBudgets: false,
  }));
  const [starting, setStarting, readStarting] = useAmountState(() => openAmount("COP"));
  const answer = (patch: Partial<SetupAnswers>) => setAnswers((now) => withFields(now, patch));
  const { categories, accountRequests, currency, currencyChosen, consent, timeZone, wantsBudgets } = answers;
  const [run, setRun, readRun] = useFormState<SetupRun>({ phase: { kind: "editing" }, busy: false });
  const { phase, busy } = run;
  const setPhase = (next: SetupPhase) => setRun((now) => withFields(now, { phase: next }));
  const setBusy = (next: boolean) => setRun((now) => withFields(now, { busy: next }));
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [stage, setStage] = useState(1);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const completed = useRef(false);
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
  const disabled = busy || phase.kind !== "editing";
  /** Whether the answers are locked at the press: while saving, or once a save was sent. */
  const lockedNow = () => { const now = readRun(); return saving.current || now.busy || now.phase.kind !== "editing"; };
  function chooseCurrency(code: string) {
    if (lockedNow()) return;
    interact();
    answer({ currency: code, currencyChosen: true });
    if (code !== readStarting().currency) setStarting(openAmount(code));
    advance(3);
  }
  const shown = starting.editor.text.trim() ? displayedMinorUnits(starting) : 0;
  const formatted = shown === null || shown < 0 ? "" : formatMoney({ currency: starting.currency, minorUnits: shown }, { hideZeroDecimals: true });
  async function finish() {
    const { phase: phaseNow } = readRun();
    if (saving.current || phaseNow.kind === "accounts") return;
    interact();
    setError("");
    let submission = heldSubmission(phaseNow);
    try {
      if (!submission) {
        const now = readAnswers();
        if (!presets || !now.categories.length || !now.currencyChosen || now.consent === null)
          return;
        const startingMinorUnits = startingAmount(readStarting(), translator);
        const chosen = [...now.categories];
        submission = {
          payload: {
            functionalCurrency: now.currency,
            startingMinorUnits,
            categories: setupSelections(chosen, presets),
            timeZone: now.timeZone,
            purchaseAlertsConsent: now.consent,
            wantsBudgets: now.wantsBudgets,
          },
          accounts: [...now.accountRequests],
          summary: {
            categories: chosen,
            currency: now.currency,
            startingMinorUnits,
            purchaseAlertsConsent: now.consent,
            wantsBudgets: now.wantsBudgets,
          },
        };
      }
      saving.current = true;
      setBusy(true);
      setPhase({ kind: "savingDefaults", submission });
      const result = await ensure(submission.payload);
      const summary = { ...submission.summary, firstCategoryId: result.firstCategoryId };
      if (submission.accounts.length)
        setPhase({ kind: "accounts", result, summary, requests: submission.accounts, index: 0 });
      else complete(summary);
    } catch (error) {
      if (
        error instanceof ConvexError &&
        setupConflict.safeParse(error.data).success
      ) {
        setPhase({ kind: "editing" });
        if (reportFailure(error)) return;
        setError(t("setup.conflict"));
      } else {
        setPhase(submission ? { kind: "retryDefaults", submission } : { kind: "editing" });
        if (reportFailure(error)) return;
        setError(
          submission
            ? t("setup.unconfirmed")
            : error instanceof Error
              ? error.message
              : t("setup.failed"),
        );
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function complete(summary: SetupSummary) {
    completed.current = true;
    sheet.current?.dismiss();
    onComplete(summary);
  }
  function nextAccount() {
    const { phase: now } = readRun();
    if (now.kind !== "accounts") return;
    if (now.index + 1 >= now.requests.length) complete(now.summary as SetupSummary);
    else setRun((current) => current.phase.kind === "accounts" ? { ...current, phase: { ...current.phase, index: now.index + 1 } } : current);
  }
  return (
    <>
      <BottomSheetModal
        ref={sheet}
        topInset={insets.top}
        snapPoints={["96%"]}
        enableDynamicSizing={false}
        enablePanDownToClose={!disabled}
        enableContentPanningGesture={!busy}
        backdropComponent={disabled ? undefined : SetupBackdrop}
        backgroundStyle={{ backgroundColor: theme.background }}
        onDismiss={() => {
          if (completed.current) return;
          if (!saving.current && readRun().phase.kind === "editing") onCancel();
          else sheet.current?.present();
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
                title={t("setup.title")}
                eyebrow={t("setup.eyebrow")}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("setup.cancel")}
              disabled={disabled}
              accessibilityState={{ disabled }}
              style={styles.icon}
              onPress={() => {
                if (lockedNow()) return;
                interact();
                sheet.current?.dismiss();
              }}
            >
              <Ionicons name="close" size={22} color={theme.foreground} />
            </Pressable>
          </View>
          {phase.kind === "accounts" ? <View style={styles.board}>
            <Text style={ui.title}>{t("setup.savedTitle")}</Text>
            <Text style={ui.muted}>{t("setup.savedDetail")}</Text>
            {phase.requests.slice(phase.index, phase.index + 1).map((accountRequest) => <DeferredAccountSetup
              key={phase.index} request={accountRequest} subject={subject}
              workspaceId={phase.result.workspace.id} profileId={phase.result.financialAccountProfile.id}
              currency={phase.summary.currency} timeZone={phase.result.workspace.timeZone} onDone={nextAccount} />)}
          </View> : <>
          <SetupCategories
            selections={categories}
            disabled={disabled}
            onAccountSetup={(request) => {
              if (!lockedNow()) setAnswers((now) => ({ ...now, accountRequests: [...now.accountRequests, request] }));
            }}
            onChange={(next) => {
              if (lockedNow()) return;
              answer({ categories: next });
              if (next.length) advance(2);
            }}
          />
          {!!accountRequests.length && <Text style={ui.muted}>{t("setup.pendingPlaces", { names: formatList(translator.language, accountRequests.map(({ name }) => name)) })}</Text>}
          {stage >= 2 && (
            <View style={styles.board}>
              <View style={styles.row}>
                <Text style={styles.label}>{t("setup.currency")}</Text>
                {currencyChosen && (
                  <Text style={[ui.muted, { flex: 1, textAlign: "right" }]}>
                    {currencyName(currency, translator)}
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
                  accessibilityLabel={t("setup.moreCurrencies")}
                  disabled={disabled}
                  onPress={() => {
                    if (lockedNow()) return;
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
                      : t("setup.more")}
                  </Text>
                </Pressable>
              </View>
              <TimeZonePicker
                value={timeZone}
                disabled={disabled}
                onChange={(next) => {
                  if (lockedNow()) return;
                  interact();
                  answer({ timeZone: next });
                }}
              />
            </View>
          )}
          {stage >= 3 && (
            <View style={styles.board}>
              <Text style={styles.label}>{t("setup.purchaseAlerts")}</Text>
              <View style={{ flexDirection: layout.reflow ? "column" : "row", gap: spacing.md }}>
                {[
                  {
                    value: true,
                    emoji: "🔔",
                    label: t("setup.alertsUse"),
                    detail: t("setup.alertsUseDetail"),
                  },
                  {
                    value: false,
                    emoji: "✍️",
                    label: t("setup.alertsSkip"),
                    detail: t("setup.alertsSkipDetail"),
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
                      if (lockedNow()) return;
                      interact();
                      answer({ consent: option.value });
                      advance(4);
                    }}
                    style={[
                      {
                        flex: layout.reflow ? undefined : 1,
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
                <Text style={styles.label}>{t("setup.whatYouHave")}</Text>
                <AmountField
                  session={starting}
                  inputAccessibilityLabel={t("setup.startingA11y")}
                  placeholder="0"
                  editable={!disabled}
                  InputComponent={BottomSheetTextInput}
                  onChange={(value) => {
                    if (lockedNow()) return;
                    interact();
                    setStarting(value);
                  }}
                  inputStyle={{
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
                  {formatted ? t("setup.startingHintAmount", { amount: formatted }) : t("setup.startingHint")}
                </Text>
              </View>
              {error ? (
                <Text accessibilityRole="alert" style={ui.error}>
                  {error}
                </Text>
              ) : null}
              <PrimaryButton
                label={t("setup.start")}
                trailingIcon="checkmark"
                pending={busy}
                disabled={phase.kind === "editing" && (!categories.length || !presets)}
                onPress={() => void finish()}
              />
              {!categories.length && (
                <Text style={[ui.muted, { textAlign: "center" }]}>
                  {t("setup.pickOne")}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={wantsBudgets ? t("setup.budgetsOn") : t("setup.budgetsOff")}
                accessibilityState={{ selected: wantsBudgets, disabled }}
                disabled={disabled}
                onPress={() => {
                  if (lockedNow()) return;
                  interact();
                  setAnswers((now) => ({ ...now, wantsBudgets: !now.wantsBudgets }));
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
                  {wantsBudgets ? t("setup.budgetsOn") : t("setup.budgetsOff")}
                </Text>
              </Pressable>
            </>
          )}
          </>}
        </BottomSheetScrollView>
      </BottomSheetModal>
      {currencyOpen && !disabled && (
        <SearchSheet
          label={t("setup.searchCurrencies")}
          placeholder={t("setup.searchCurrenciesPlaceholder")}
          options={currencyOptions(translator)}
          selected={currencyChosen ? currency : null}
          onSelect={chooseCurrency}
          onClose={() => setCurrencyOpen(false)}
        />
      )}
    </>
  );
}
