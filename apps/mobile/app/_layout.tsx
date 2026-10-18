import "react-native-gesture-handler";
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
} from "@expo-google-fonts/geist";
import { ClerkProvider, useAuth, useClerk, useSSO } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useLayoutEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { api } from "../src/features/api";
import { LocalEntryGate } from "../src/local-auth/LocalEntryGate";
import { DeviceAdmissionGate } from "../src/device-admission/DeviceAdmissionGate";
import { useDeviceAccessFailure } from "../src/local-auth/accessFailure";
import {
  Header,
  PrimaryButton,
  Screen,
  SecondaryButton,
  ui,
} from "../src/ui/core";

WebBrowser.maybeCompleteAuthSession();
const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convex = url ? new ConvexReactClient(url) : null;

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const report = useDeviceAccessFailure();
  useLayoutEffect(() => { report(error); }, [error, report]);
  return (
    <SafeAreaProvider>
      <Screen>
        <Header title="Could not load your money" />
        <Text style={ui.body}>Check your connection and try again.</Text>
        <PrimaryButton label="Try again" onPress={retry} />
      </Screen>
    </SafeAreaProvider>
  );
}
function SignIn({
  onSessionCreated,
}: {
  onSessionCreated: (sessionId: string) => void;
}) {
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: "lukapp-u01",
          path: "oauth-callback",
        }),
      });
      if (result.createdSessionId && result.setActive) {
        onSessionCreated(result.createdSessionId);
        await result.setActive({ session: result.createdSessionId });
      } else if (
        result.authSessionResult?.type !== "cancel" &&
        result.authSessionResult?.type !== "dismiss"
      )
        setError(
          "Sign-in needs another step. Complete it in Clerk, then try again.",
        );
    } catch {
      setError("Sign-in could not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Header title="Your money, in one place." eyebrow="LUKAPP" />
      <Text style={ui.body}>Sign in to start tracking.</Text>
      {error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      )}
      <PrimaryButton
        label={busy ? "Signing in…" : "Continue with Google"}
        disabled={busy}
        onPress={() => void signIn()}
      />
    </Screen>
  );
}
function Admission() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const connection = useQuery(
    api.authConnection.connection,
    isAuthenticated ? {} : "skip",
  );
  if (!isLoaded || isLoading)
    return (
      <Screen>
        <ActivityIndicator />
        <Text style={ui.body}>Connecting…</Text>
      </Screen>
    );
  if (!isSignedIn)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  if (
    !isAuthenticated ||
    connection?.status === "not-owner" ||
    connection?.status === "signed-out"
  )
    return (
      <Screen>
        <Header title="Access unavailable" />
        <Text style={ui.body}>
          This account cannot open Lukapp. Use the admitted owner account.
        </Text>
        <SecondaryButton label="Sign out" onPress={() => void signOut()} />
      </Screen>
    );
  if (!connection)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  return (
    <DeviceAdmissionGate>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="post" />
      <Stack.Screen name="drafts" />
      <Stack.Screen name="alerts" />
      <Stack.Screen name="month-close" />
      <Stack.Screen name="account" />
      <Stack.Screen name="overview" />
      <Stack.Screen name="plans" />
      <Stack.Screen name="budget" />
      <Stack.Screen name="recovery" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="oauth-callback" />
    </Stack>
    </DeviceAdmissionGate>
  );
}
export default function Layout() {
  const [loaded, error] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
  });
  if (!convex || !publishableKey)
    return (
      <SafeAreaProvider>
        <Screen>
          <Header title="Development configuration needed" />
          <Text style={ui.body}>
            Set EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
            then restart Metro.
          </Text>
        </Screen>
      </SafeAreaProvider>
    );
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <LocalEntryGate
            renderSignIn={(onSessionCreated) => (
              <SignIn onSessionCreated={onSessionCreated} />
            )}
          >
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
              <BottomSheetModalProvider>
                <Admission />
              </BottomSheetModalProvider>
            </ConvexProviderWithClerk>
          </LocalEntryGate>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
