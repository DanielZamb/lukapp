import React from "react";
import { Text, TextInput, View } from "react-native";
import { useT } from "../i18n";
import { Header, PrimaryButton, Screen, SecondaryButton, useUi, useTheme } from "../ui/core";

export function NamedDeviceStep({
  name,
  busy,
  canSubmit,
  error,
  onNameChange,
  onSubmit,
  onSignOut,
}: {
  name: string;
  busy: boolean;
  canSubmit: boolean;
  error: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onSignOut: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const { t } = useT();
  return (
    <Screen>
      <Header title={t("access.nameTitle")} eyebrow={t("access.devicesEyebrow")} />
      <Text style={ui.body}>{t("access.nameBody")}</Text>
      <View style={ui.section}>
        <Text style={ui.label}>{t("access.nameLabel")}</Text>
        <TextInput
          accessibilityLabel={t("access.nameA11y")}
          value={name}
          onChangeText={onNameChange}
          editable={!busy}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
          placeholder={t("access.namePlaceholder")}
          placeholderTextColor={theme.mutedForeground}
          style={ui.input}
        />
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      )}
      <PrimaryButton
        label={busy ? t("access.registering") : t("access.register")}
        disabled={!canSubmit || busy}
        onPress={onSubmit}
      />
      <SecondaryButton label={t("access.signOut")} disabled={busy} onPress={onSignOut} />
    </Screen>
  );
}
