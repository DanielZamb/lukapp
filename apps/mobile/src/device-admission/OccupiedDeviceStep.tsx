import React from "react";
import { Text, TextInput, View } from "react-native";
import { formatDateTime, useT } from "../i18n";
import { Header, PrimaryButton, Screen, SecondaryButton, useTheme, useUi } from "../ui/core";

export function OccupiedDeviceStep({ platform, label, lastSeenAt, name, busy, error, onNameChange, onUse, onKeep }: {
  platform: "android" | "ios";
  label: string;
  lastSeenAt: number;
  name: string;
  busy: boolean;
  error: string;
  onNameChange: (name: string) => void;
  onUse: () => void;
  onKeep: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const { t, language } = useT();
  return (
    <Screen>
      <Header eyebrow={t("access.devicesEyebrow")} title={t(platform === "android" ? "access.occupiedTitleAndroid" : "access.occupiedTitleIos")} />
      <View style={ui.section}>
        <Text style={ui.label}>{label}</Text>
        <Text style={ui.muted}>{t("access.lastSeen", { date: formatDateTime(language, lastSeenAt) })}</Text>
      </View>
      <Text style={ui.body}>{t("access.occupiedBody")}</Text>
      <View style={ui.section}>
        <Text style={ui.label}>{t("access.thisPhoneName")}</Text>
        <TextInput accessibilityLabel={t("access.nameA11y")} value={name} onChangeText={onNameChange}
          editable={!busy} autoCapitalize="words" autoCorrect={false} maxLength={80}
          placeholder={t("access.namePlaceholder")} placeholderTextColor={theme.mutedForeground} style={ui.input} />
      </View>
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <PrimaryButton label={busy ? t("access.moving") : t("access.useThisPhone")}
        disabled={busy || !name.trim() || name.trim().length > 80} onPress={onUse} />
      <SecondaryButton label={t("access.keepUsing", { device: label })} disabled={busy} onPress={onKeep} />
    </Screen>
  );
}
