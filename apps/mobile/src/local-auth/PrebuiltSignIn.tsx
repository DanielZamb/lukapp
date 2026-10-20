import { useAuth, useSession } from "@clerk/expo";
import { AuthView, useAuthViewState } from "@clerk/expo/native-components";
import { useLayoutEffect, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header, SecondaryButton, useUi } from "../ui/core";
import { spacing } from "../ui/tokens";

export function PrebuiltSignIn({ onSessionCreated }: {
  onSessionCreated: (sessionId: string, signal: AbortSignal) => Promise<void>;
}) {
  const ui = useUi();
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
    <SafeAreaView style={ui.screen}>
      <AuthView
        mode="signInOrUp"
        isDismissible={false}
        logo={
          <View style={{ padding: spacing.xl, width: 300 }}>
            <Header title="Your money, in one place." eyebrow="LUKAPP" />
          </View>
        }
      />
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
    </SafeAreaView>
  );
}
