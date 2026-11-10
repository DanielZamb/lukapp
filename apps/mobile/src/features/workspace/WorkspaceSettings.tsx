import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Crypto from "expo-crypto";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatLongDate, useT } from "../../i18n";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { useLocalInputLease } from "../../local-auth/localInput";
import { Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, useTheme, useUi } from "../../ui/core";
import { font, spacing } from "../../ui/tokens";
import { api } from "../api";
import { accountEmoji, placeTitle } from "../places/model";
import { SearchSheet } from "../setup/SearchSheet";
import { currencyOptions } from "../setup/currencies";
import { TimeZoneSheet } from "../TimeZonePicker";
import { calendarDate, timeZoneLabel } from "../timeZones";
import { countUnsentInCurrency, dropUnsentAfterCurrencyChange } from "./deviceInput";
import { SettingSheet } from "./SettingSheet";
import { currencyLockKey, useSettingChange, type SettingReceipt, type SettingTransport } from "./useSettingChange";

type Profile = FunctionReturnType<typeof api.accounting.listFinancialAccountProfiles>[number];
type Choice = "timeZone" | "functionalCurrency";
type Step =
  | { kind: "list" }
  | { kind: "place" }
  | { kind: "pick"; setting: Choice; chosen: string | null }
  | { kind: "confirm"; setting: Choice; value: string };

export function WorkspaceSettings({ workspaceId, onBack }: { workspaceId: string; onBack: () => void }) {
  const translator = useT();
  const { t } = translator;
  const settings = useQuery(api.accounting.workspaceSettings, { workspaceId });
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId });
  const [step, setStep] = useState<Step>({ kind: "list" });
  const header = <Header eyebrow={t("workspace.eyebrow")} title={t("workspace.title")} onBack={onBack} />;
  if (!settings || !profiles)
    return <Screen>{header}<ActivityIndicator accessibilityLabel={t("workspace.loading")} /></Screen>;
  const placeName = (id: string) => {
    const profile = profiles.find((place) => place.id === id);
    return profile ? placeTitle(profile.name, profiles.length, t) : "";
  };
  const zoneName = (zone: string) => timeZoneLabel(zone, translator);
  const lock = currencyLockKey(settings);
  const close = () => setStep({ kind: "list" });
  const pick = (setting: Choice) => setStep({ kind: "pick", setting, chosen: null });
  const choose = (chosen: string) => setStep((now) => now.kind === "pick" ? { ...now, chosen } : now);
  const afterPick = (current: string) => setStep((now) => now.kind === "pick" && now.chosen !== null && now.chosen !== current
    ? { kind: "confirm", setting: now.setting, value: now.chosen } : { kind: "list" });
  const seed = (current: string, describe: (value: string) => string) => ({ workspaceId, current, describe });
  return (
    <Screen>
      {header}
      <ListGroup>
        <ListRow title={t("workspace.defaultPlace")} detail={t("workspace.defaultPlaceHelp")} icon="home-outline"
          value={placeName(settings.defaultFinancialAccountProfileId)}
          onPress={profiles.length > 1 ? () => setStep({ kind: "place" }) : undefined} />
        <ListRow title={t("workspace.timeZone")} icon="time-outline" value={zoneName(settings.timeZone)}
          onPress={() => pick("timeZone")} />
        <ListRow title={t("workspace.currency")} icon="cash-outline" value={settings.functionalCurrency}
          detail={lock ? t(lock, { currency: settings.functionalCurrency }) : t("workspace.currencyChangeable")}
          onPress={lock ? undefined : () => pick("functionalCurrency")} />
      </ListGroup>
      {step.kind === "place" && <PlaceSheet profiles={profiles} onClose={close}
        seed={seed(settings.defaultFinancialAccountProfileId, placeName)} />}
      {step.kind === "pick" && step.setting === "timeZone" &&
        <TimeZoneSheet value={settings.timeZone} onSelect={choose} onClose={() => afterPick(settings.timeZone)} />}
      {step.kind === "pick" && step.setting === "functionalCurrency" &&
        <SearchSheet label={t("setup.searchCurrencies")} placeholder={t("setup.searchCurrenciesPlaceholder")}
          options={currencyOptions(translator)} selected={settings.functionalCurrency} onSelect={choose}
          onClose={() => afterPick(settings.functionalCurrency)} />}
      {step.kind === "confirm" && step.setting === "timeZone" &&
        <ZoneConfirm seed={seed(settings.timeZone, zoneName)} value={step.value} onClose={close} />}
      {step.kind === "confirm" && step.setting === "functionalCurrency" &&
        <CurrencyConfirm seed={seed(settings.functionalCurrency, (code) => code)} value={step.value}
          lock={lock && t(lock, { currency: settings.functionalCurrency })} onClose={close} />}
    </Screen>
  );
}

type Seed = Parameters<typeof useSettingChange>[1];

function useTransport<S extends "defaultPlace" | Choice>(
  send: SettingTransport<S>["send"],
  sheet: RefObject<BottomSheetModal | null>,
  afterDone?: (receipt: SettingReceipt) => void,
): SettingTransport<S> {
  const reportFailure = useDeviceAccessFailure();
  return {
    send, reportFailure, newKey: Crypto.randomUUID,
    onDone: (receipt) => { afterDone?.(receipt); sheet.current?.dismiss(); },
  };
}

function PlaceSheet({ seed, profiles, onClose }: { seed: Seed; profiles: Profile[]; onClose: () => void }) {
  const ui = useUi();
  const theme = useTheme();
  const { t } = useT();
  const styles = useOptionStyles();
  const interact = useLocalEntryInteraction();
  const sheet = useRef<BottomSheetModal>(null);
  const transport = useTransport<"defaultPlace">(useAction(api.accounting.changeDefaultPlace), sheet);
  const change = useSettingChange("defaultPlace", seed, transport);
  const [chosen, setChosen] = useState(seed.current);
  const shown = change.locked ? chosen : seed.current;
  const select = (id: string) => {
    if (change.locked) return;
    interact();
    if (id === seed.current) return sheet.current?.dismiss();
    setChosen(id);
    void change.submit(id);
  };
  return (
    <SettingSheet sheetRef={sheet} label={t("workspace.defaultPlaceTitle")} title={t("workspace.defaultPlaceTitle")}
      locked={change.locked} onDismiss={onClose}>
      <Text style={ui.muted}>{t("workspace.defaultPlaceHelp")}</Text>
      <View>
        {profiles.map((profile) => {
          const name = seed.describe(profile.id);
          const checked = profile.id === shown;
          return (
            <Pressable key={profile.id} accessibilityRole="radio" accessibilityLabel={name}
              accessibilityState={{ checked, disabled: change.locked }} disabled={change.locked}
              onPress={() => select(profile.id)} style={styles.option}>
              <Text style={styles.glyph}>{accountEmoji(profile)}</Text>
              <Text style={styles.name}>{name}</Text>
              {checked && <Ionicons name="checkmark" size={20} color={theme.primary} />}
            </Pressable>
          );
        })}
      </View>
      {change.busy && <ActivityIndicator accessibilityLabel={t("workspace.saving")} />}
      {!!change.error && <Text accessibilityRole="alert" style={ui.error}>{change.error}</Text>}
      {change.uncertain && <PrimaryButton label={t("workspace.retry")} trailingIcon="refresh"
        onPress={() => { interact(); void change.submit(chosen); }} />}
    </SettingSheet>
  );
}

function ZoneConfirm({ seed, value, onClose }: { seed: Seed; value: string; onClose: () => void }) {
  const { t, language } = useT();
  const sheet = useRef<BottomSheetModal>(null);
  const transport = useTransport<"timeZone">(useAction(api.accounting.changeWorkspaceTimeZone), sheet);
  const change = useSettingChange("timeZone", seed, transport);
  const zone = seed.describe(value);
  const now = new Date();
  const today = calendarDate(now, value) === calendarDate(now, seed.current) ? null
    : t("workspace.timeZoneToday", { date: formatLongDate(language, now, value) });
  const monthBehind = calendarDate(now, value).slice(0, 7) < calendarDate(now, seed.current).slice(0, 7);
  return <ConfirmBody sheet={sheet} change={change} value={value} current={seed.current} onClose={onClose}
    title={t("workspace.timeZoneTitle", { zone })} confirmLabel={t("workspace.timeZoneConfirm")}
    lines={[t("workspace.timeZoneBody", { zone }), ...(today ? [today] : []),
      ...(monthBehind && !change.error ? [t("workspace.timeZoneMonthBehind")] : [])]} ready={!monthBehind} />;
}

function CurrencyConfirm({ seed, value, lock, onClose }: { seed: Seed; value: string; lock: string | null; onClose: () => void }) {
  const { t, tn } = useT();
  const lease = useLocalInputLease();
  const reportFailure = useDeviceAccessFailure();
  const sheet = useRef<BottomSheetModal>(null);
  const [drops, setDrops] = useState<number | "unread" | null>(null);
  useEffect(() => {
    let current = true;
    countUnsentInCurrency(lease, seed.workspaceId, seed.current)
      .then((count) => { if (current) setDrops(count); })
      .catch(() => { if (current) setDrops("unread"); });
    return () => { current = false; };
  }, [lease, seed.workspaceId, seed.current]);
  const transport = useTransport<"functionalCurrency">(useAction(api.accounting.changeFunctionalCurrency), sheet, (receipt) => {
    if (receipt.changed) void dropUnsentAfterCurrencyChange(lease, receipt.workspaceId, receipt.previousValue)
      .catch((error: unknown) => { reportFailure(error); });
  });
  const change = useSettingChange("functionalCurrency", seed, transport);
  const local = drops === "unread" ? [t("workspace.currencyDropsUnread")]
    : drops ? [tn("workspace.currencyDrops", drops, { currency: seed.current })] : [];
  return <ConfirmBody sheet={sheet} change={change} value={value} current={seed.current} onClose={onClose}
    title={t("workspace.currencyTitle", { currency: value })} confirmLabel={t("workspace.currencyConfirm", { currency: value })}
    lines={[t("workspace.currencyBody"), ...local, ...(lock && !change.error ? [lock] : [])]}
    ready={!lock && typeof drops === "number"} />;
}

function ConfirmBody({ sheet, change, value, current, title, lines, confirmLabel, ready, onClose }: {
  sheet: RefObject<BottomSheetModal | null>;
  change: ReturnType<typeof useSettingChange>;
  value: string;
  current: string;
  title: string;
  lines: string[];
  confirmLabel: string;
  ready: boolean;
  onClose: () => void;
}) {
  const ui = useUi();
  const { t } = useT();
  const interact = useLocalEntryInteraction();
  const confirm = () => {
    interact();
    if (!change.uncertain && !ready) return;
    if (!change.uncertain && value === current) return sheet.current?.dismiss();
    void change.submit(value);
  };
  return (
    <SettingSheet sheetRef={sheet} label={title} title={title} locked={change.locked} onDismiss={onClose}>
      {lines.map((line) => <Text key={line} style={ui.body}>{line}</Text>)}
      {!!change.error && <Text accessibilityRole="alert" style={ui.error}>{change.error}</Text>}
      <PrimaryButton label={change.busy ? t("workspace.saving") : change.uncertain ? t("workspace.retry") : confirmLabel}
        trailingIcon="checkmark" pending={change.busy} disabled={change.busy || (!change.uncertain && !ready)} onPress={confirm} />
      {!change.locked && <SecondaryButton label={t("common.cancel")} onPress={() => sheet.current?.dismiss()} />}
    </SettingSheet>
  );
}

function useOptionStyles() {
  const ui = useUi();
  return useMemo(() => StyleSheet.create({
    option: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
    glyph: { width: 32, fontSize: 22, textAlign: "center" },
    name: { ...ui.body, flex: 1, minWidth: 0, fontFamily: font.semibold },
  }), [ui]);
}
