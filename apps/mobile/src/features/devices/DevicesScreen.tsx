import { useFormState } from "../amount/useAmountState";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from "react-native";
import { useCurrentInstall } from "../../device-admission/currentInstall";
import { useT, type MessageKey } from "../../i18n";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Field, Header, PrimaryButton, Screen, SecondaryButton, useTheme, useUi } from "../../ui/core";
import { font, radius, spacing, type Theme } from "../../ui/tokens";
import { api } from "../api";
import { useFrozenCommand } from "../useFrozenCommand";

type Device = FunctionReturnType<typeof api.deviceAccess.list>[number];
type DeviceList = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; devices: Device[] };
type Step =
  | { kind: "list" }
  | { kind: "rename"; device: Device; name: string }
  | { kind: "remove"; device: Device }
  | { kind: "signOutOthers" };
type Command =
  | { kind: "rename"; request: FunctionArgs<typeof api.deviceAccess.register> }
  | { kind: "remove"; device: Device }
  | { kind: "signOutOthers" };

function deviceRefusalCode(error: unknown) {
  const data: unknown = error instanceof ConvexError ? error.data : null;
  return data !== null && typeof data === "object" && "code" in data && typeof data.code === "string"
    ? data.code
    : null;
}

const platformName: Record<Device["platform"], MessageKey> = {
  ios: "lifecycle.platformIos",
  android: "lifecycle.platformAndroid",
};

export function DevicesScreen({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const list = useAction(api.deviceAccess.list);
  const register = useAction(api.deviceAccess.register);
  const revoke = useAction(api.deviceAccess.revoke);
  const revokeOthers = useAction(api.deviceAccess.revokeOtherSessions);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const install = useCurrentInstall();
  const [devices, setDevices] = useState<DeviceList>({ kind: "loading" });
  const [step, setStep, readStep] = useFormState<Step>({ kind: "list" });
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  const latestLoad = useRef(0);
  const command = useFrozenCommand<Command, Command>({
    send: async (request) => {
      if (request.kind === "rename") await register(request.request);
      else if (request.kind === "remove") await revoke({ deviceId: request.device.deviceId });
      else await revokeOthers({});
      return request;
    },
    reportFailure,
    refusalCode: deviceRefusalCode,
    onDone: (done) => {
      setStep({ kind: "list" });
      setNotice(done.kind === "rename" ? t("lifecycle.renamed")
        : done.kind === "remove" ? t("lifecycle.removed", { name: done.device.label })
        : t("lifecycle.signedOutOthers"));
      void load();
    },
  });
  const { busy } = command;
  const uncertain = command.state.name === "uncertain";

  async function load() {
    const attempt = ++latestLoad.current;
    try {
      const rows = await list({});
      if (mounted.current && attempt === latestLoad.current)
        setDevices({ kind: "ready", devices: rows.filter((device) => !device.revoked)
          .sort((a, b) => Number(b.current) - Number(a.current)) });
    } catch (failure) {
      if (reportFailure(failure) || !mounted.current || attempt !== latestLoad.current) return;
      setDevices({ kind: "failed" });
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, []);

  function showStoredList(message: string) {
    command.release();
    setStep({ kind: "list" });
    setNotice(message);
    setDevices({ kind: "loading" });
    void load();
  }
  function closeStep() {
    const at = command.atPress();
    if (at === "sending") return;
    if (at === "held") return showStoredList(t("lifecycle.devicesChecked"));
    command.release();
    setStep({ kind: "list" });
  }
  async function send(request: Command) {
    setNotice("");
    const outcome = await command.submit(() => request);
    if (outcome === "uncertain" && request.kind === "signOutOthers")
      showStoredList(t("lifecycle.signOutOthersUncertain"));
  }
  const back = useRef({ open: false, close: closeStep });
  back.current = { open: step.kind !== "list", close: closeStep };
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!back.current.open) return false;
      back.current.close();
      return true;
    });
    return () => subscription.remove();
  }, []);
  const refusal = command.state.name === "open" ? command.state.refusal : null;

  const header = <Header eyebrow={t("lifecycle.devicesEyebrow")} title={t("lifecycle.devicesTitle")}
    onBack={busy ? undefined : step.kind === "list" ? onBack : closeStep} />;
  const alert = (message: string) => <Text accessibilityRole="alert" style={ui.error}>{message}</Text>;
  const checkDevices = <SecondaryButton label={t("lifecycle.checkDevices")} disabled={busy}
    onPress={() => showStoredList(t("lifecycle.devicesChecked"))} />;

  if (step.kind === "rename") {
    const name = step.name.trim();
    const issue = !name ? t("lifecycle.renameEmpty") : undefined;
    const changed = name !== step.device.label;
    return (
      <Screen>
        {header}
        <Text accessibilityRole="header" style={ui.title}>{t("lifecycle.renameTitle")}</Text>
        <Field label={t("lifecycle.renameLabel")} accessibilityLabel={t("lifecycle.renameLabel")}
          value={step.name} editable={!command.frozen} maxLength={80} autoCapitalize="words" autoCorrect={false} autoFocus
          helperText={t("lifecycle.renameHint")} error={issue}
          onChangeText={(value) => {
            if (!command.canEdit()) return;
            interact();
            setStep((now) => now.kind === "rename" ? { ...now, name: value } : now);
          }} />
        {uncertain ? alert(t("lifecycle.renameUncertain")) : refusal && alert(t("lifecycle.renameFailed"))}
        <PrimaryButton label={busy ? t("lifecycle.saving") : uncertain ? t("lifecycle.sendAgain") : t("lifecycle.renameSave")}
          trailingIcon="checkmark" disabled={!uncertain && (!!issue || !changed || !install)} pending={busy}
          onPress={() => {
            const now = readStep();
            if (now.kind !== "rename") return;
            const typed = now.name.trim();
            if (!install || (command.atPress() !== "held" && (!typed || typed === now.device.label))) return;
            void send({ kind: "rename", request: { ...install, label: typed } });
          }} />
        {uncertain ? checkDevices : <SecondaryButton label={t("common.cancel")} disabled={busy} onPress={closeStep} />}
      </Screen>
    );
  }

  if (step.kind === "remove" || step.kind === "signOutOthers") {
    const remove = step.kind === "remove";
    const name = remove ? step.device.label : "";
    return (
      <Screen>
        {header}
        <Text accessibilityRole="header" style={ui.title}>
          {remove ? t("lifecycle.removeTitle", { name }) : t("lifecycle.signOutOthersTitle")}
        </Text>
        <Text style={ui.body}>{remove ? t("lifecycle.removeBody", { name }) : t("lifecycle.signOutOthersBody")}</Text>
        {uncertain ? remove && alert(t("lifecycle.removeUncertain", { name }))
          : refusal && alert(t(remove ? "lifecycle.removeFailed" : "lifecycle.signOutOthersFailed"))}
        {(remove || !uncertain) && <SecondaryButton tone="danger" disabled={busy}
          label={busy ? t(remove ? "lifecycle.removing" : "lifecycle.signingOutOthers")
            : uncertain ? t("lifecycle.sendAgain")
            : t(remove ? "lifecycle.removeConfirm" : "lifecycle.signOutOthersConfirm")}
          onPress={() => {
            const now = readStep();
            if (now.kind === "remove") void send({ kind: "remove", device: { ...now.device } });
            else if (now.kind === "signOutOthers") void send({ kind: "signOutOthers" });
          }} />}
        {uncertain ? checkDevices
          : <SecondaryButton label={remove ? t("lifecycle.keepAccess") : t("common.cancel")} disabled={busy} onPress={closeStep} />}
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <Text style={ui.muted}>{t("lifecycle.devicesIntro")}</Text>
      {!!notice && <Text accessibilityLiveRegion="polite" style={ui.body}>{notice}</Text>}
      {devices.kind === "loading" ? <ActivityIndicator accessibilityLabel={t("lifecycle.devicesLoading")} />
        : devices.kind === "failed" ? <View style={ui.section}>
          <Text accessibilityRole="alert" style={ui.error}>{t("lifecycle.devicesLoadFailed")}</Text>
          <SecondaryButton label={t("common.retry")} onPress={() => { setDevices({ kind: "loading" }); void load(); }} />
        </View>
        : devices.devices.length === 0 ? <Text style={ui.muted}>{t("lifecycle.devicesEmpty")}</Text>
        : <View style={ui.section}>
          {devices.devices.map((device) => (
            <View key={device.deviceId} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.icon}>
                  <Ionicons name="phone-portrait-outline" size={20} color={theme.foreground} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name}>{device.label}</Text>
                  <Text style={styles.detail}>{t("lifecycle.deviceDetail", {
                    platform: t(platformName[device.platform]),
                    status: t(device.clerkActive ? "lifecycle.statusActive" : "lifecycle.statusSignedOut"),
                  })}</Text>
                  {device.current && <Text style={styles.current}>{t("lifecycle.thisDevice")}</Text>}
                </View>
              </View>
              {device.current
                ? install && <SecondaryButton label={t("lifecycle.renameAction")}
                  accessibilityLabel={t("lifecycle.renameA11y", { name: device.label })}
                  onPress={() => { setNotice(""); setStep({ kind: "rename", device, name: device.label }); }} />
                : <SecondaryButton tone="danger" label={t("lifecycle.removeAction")}
                  accessibilityLabel={t("lifecycle.removeA11y", { name: device.label })}
                  onPress={() => { setNotice(""); setStep({ kind: "remove", device }); }} />}
            </View>
          ))}
          <SecondaryButton tone="danger" label={t("lifecycle.signOutOthers")}
            onPress={() => { setNotice(""); setStep({ kind: "signOutOthers" }); }} />
        </View>}
    </Screen>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1,
      borderColor: theme.border, backgroundColor: theme.secondary },
    head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center",
      backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border },
    copy: { flex: 1, minWidth: 0, gap: spacing.xs },
    name: { color: theme.foreground, fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
    detail: { color: theme.mutedForeground, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
    current: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full,
      borderWidth: 1, borderColor: theme.ring, color: theme.foreground, fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  });
}
