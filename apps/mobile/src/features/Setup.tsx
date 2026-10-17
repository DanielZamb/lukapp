import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { api } from "./api";
import { parseMoney } from "./money";
import { Choice, Header, PrimaryButton, theme, ui } from "../ui/core";
import { spacing } from "../ui/tokens";

export function Setup({ onComplete }: { onComplete: () => void }) {
  const sheet = useRef<BottomSheetModal>(null);
  const ensure = useMutation(api.accounting.ensurePersonalDefaults);
  const [currency, setCurrency] = useState("COP");
  const [starting, setStarting] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    sheet.current?.present();
  }, []);
  async function finish() {
    setError("");
    try {
      const startingMinorUnits = parseMoney(starting);
      if (startingMinorUnits < 0)
        throw new Error("Enter zero or the amount you hold.");
      setBusy(true);
      await ensure({ functionalCurrency: currency, startingMinorUnits });
      sheet.current?.dismiss();
      onComplete();
    } catch (error) {
      setError(
        error instanceof Error && !busy
          ? error.message
          : "Setup could not finish. Retry with the same answers.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header title="Make it yours" />
      <Text style={ui.body}>Four quick answers to get started.</Text>
      <PrimaryButton
        label="Start setup"
        onPress={() => sheet.current?.present()}
      />
      <BottomSheetModal
        ref={sheet}
        snapPoints={["92%"]}
        enableDynamicSizing={false}
        enablePanDownToClose={!busy}
        enableContentPanningGesture={!busy}
        backgroundStyle={{ backgroundColor: theme.background }}
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.xxl, gap: spacing.xxl }}
        >
          <Header title="Make it yours" eyebrow="FIRST SETUP" />
          <View style={ui.section}>
            <Text style={ui.label}>1 · CATEGORIES</Text>
            <Text style={ui.body}>Start without categories</Text>
            <Text style={ui.muted}>
              Keep your first expense simple. Categories come later.
            </Text>
          </View>
          <View style={ui.section}>
            <Text style={ui.label}>2 · CURRENCY</Text>
            <Choice
              label="Colombian peso"
              detail="COP"
              selected={currency === "COP"}
              onPress={() => !busy && setCurrency("COP")}
            />
            <Choice
              label="US dollar"
              detail="USD"
              selected={currency === "USD"}
              onPress={() => !busy && setCurrency("USD")}
            />
          </View>
          <View style={ui.section}>
            <Text style={ui.label}>3 · PURCHASE ALERTS</Text>
            <Text style={ui.body}>Not now</Text>
            <Text style={ui.muted}>Post expenses manually for now.</Text>
          </View>
          <View style={ui.section}>
            <Text style={ui.label}>4 · STARTING AMOUNT</Text>
            <Text style={ui.muted}>
              How much do you hold today? Use a comma for cents.
            </Text>
            <BottomSheetTextInput
              accessibilityLabel="Starting amount"
              value={starting}
              onChangeText={setStarting}
              editable={!busy}
              keyboardType="decimal-pad"
              style={ui.input}
            />
          </View>
          {error && (
            <Text accessibilityRole="alert" style={ui.error}>
              {error}
            </Text>
          )}
          <PrimaryButton
            label={busy ? "Setting up…" : "Start tracking"}
            disabled={busy}
            onPress={() => void finish()}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
}
