import React from "react";
import { Text, TextInput, View } from "react-native";
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
  return (
    <Screen>
      <Header eyebrow="YOUR DEVICES" title={`You already use Lukapp on another ${platform === "android" ? "Android phone" : "iPhone"}`} />
      <View style={ui.section}>
        <Text style={ui.label}>{label}</Text>
        <Text style={ui.muted}>Last seen {new Date(lastSeenAt).toLocaleString()}</Text>
      </View>
      <Text style={ui.body}>
        Your account can use one Android phone and one iPhone at a time.
        Moving to this phone signs the old device out and clears its local drafts when it next opens.
      </Text>
      <View style={ui.section}>
        <Text style={ui.label}>THIS PHONE'S NAME</Text>
        <TextInput accessibilityLabel="Device name" value={name} onChangeText={onNameChange}
          editable={!busy} autoCapitalize="words" autoCorrect={false} maxLength={80}
          placeholder="My phone" placeholderTextColor={theme.mutedForeground} style={ui.input} />
      </View>
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <PrimaryButton label={busy ? "Moving access…" : "Use this phone instead"}
        disabled={busy || !name.trim() || name.trim().length > 80} onPress={onUse} />
      <SecondaryButton label={`Keep using ${label}`} disabled={busy} onPress={onKeep} />
    </Screen>
  );
}
