import { Text, TextInput, View } from "react-native";
import { Header, PrimaryButton, Screen, SecondaryButton, ui } from "../ui/core";

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
  return (
    <Screen>
      <Header title="Name this device" eyebrow="YOUR DEVICES" />
      <Text style={ui.body}>
        Choose a name so you can recognize this phone.
      </Text>
      <View style={ui.section}>
        <Text style={ui.label}>DEVICE NAME</Text>
        <TextInput
          accessibilityLabel="Device name"
          value={name}
          onChangeText={onNameChange}
          editable={!busy}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="My phone"
          style={ui.input}
        />
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      )}
      <PrimaryButton
        label={busy ? "Registering…" : "Register device"}
        disabled={!canSubmit || busy}
        onPress={onSubmit}
      />
      <SecondaryButton label="Sign out" disabled={busy} onPress={onSignOut} />
    </Screen>
  );
}
