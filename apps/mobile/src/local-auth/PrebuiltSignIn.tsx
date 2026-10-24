import { useAuth, useSession } from "@clerk/expo";
import { AuthView, useAuthViewState } from "@clerk/expo/native-components";
import { useLayoutEffect, useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SecondaryButton, useUi } from "../ui/core";
import { spacing } from "../ui/tokens";
import { BrandLogo } from "../ui/Brand";

export function PrebuiltSignIn({ onSessionCreated }: {
  onSessionCreated: (sessionId: string, signal: AbortSignal) => Promise<void>;
}) {
  const ui = useUi();
  const { height, fontScale } = useWindowDimensions();
  const { session } = useSession();
  const { sessionId } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded, isAuthFlowComplete } = useAuthViewState();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const completeSessionId = isLoaded && isAuthFlowComplete &&
    session?.status === "active" && session.id === sessionId &&
    !session.currentTask ? session.id : null;

  useLayoutEffect(() => {
    if (!completeSessionId) return;
    const handoff = new AbortController();
    setError(false);
    void onSessionCreated(completeSessionId, handoff.signal).catch(() => {
      if (handoff.signal.aborted) return;
      setError(true);
    });
    return () => handoff.abort();
  }, [completeSessionId, onSessionCreated, attempt]);

  return (
    <KeyboardAvoidingView style={ui.screen} behavior="height">
      <SafeAreaView style={ui.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={{ minHeight: Math.max(height, 640 * fontScale), flex: 1 }}>
            <AuthView
              mode="signInOrUp"
              isDismissible={false}
              logo={
                <View style={{ paddingVertical: spacing.sm }}>
                  <BrandLogo width={128} />
                </View>
              }
            />
          </View>
          {error && (
            <View style={{ padding: spacing.xl }}>
              <Text accessibilityRole="alert" style={ui.error}>
                Sign-in could not finish. Please try again.
              </Text>
              <SecondaryButton label="Try again" onPress={() => {
                setError(false);
                setAttempt(value => value + 1);
              }} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
