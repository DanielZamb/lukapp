import "react-native-gesture-handler";
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
} from "@expo-google-fonts/geist";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useLayoutEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { api } from "../src/features/api";
import { LocalEntryGate } from "../src/local-auth/LocalEntryGate";
import { PrebuiltSignIn } from "../src/local-auth/PrebuiltSignIn";
import { DeviceAdmissionGate } from "../src/device-admission/DeviceAdmissionGate";
import { useDeviceAccessFailure } from "../src/local-auth/accessFailure";
import {
  Header,
  PrimaryButton,
  Screen,
  SecondaryButton,
  ResponsiveThemeProvider as ThemeProvider,
  SheetAccessibilityBoundary,
  useUi,
} from "../src/ui/core";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convex = url ? new ConvexReactClient(url) : null;
void SplashScreen.preventAutoHideAsync();

function ErrorFallback({ error, retry }: ErrorBoundaryProps) {
  const ui = useUi();
  const report = useDeviceAccessFailure();
  useLayoutEffect(() => { report(error); }, [error, report]);
  return (
    <Screen>
      <Header title="Could not load your money" />
      <Text style={ui.body}>Check your connection and try again.</Text>
      <PrimaryButton label="Try again" onPress={retry} />
    </Screen>
  );
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorFallback {...props} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
function ConfigNeeded() {
  const ui = useUi();
  return (
    <Screen>
      <Header title="Development configuration needed" />
      <Text style={ui.body}>
        Set EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, then
        restart Metro.
      </Text>
    </Screen>
  );
}

function Admission() {
  const ui = useUi();
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
      <Stack.Screen name="level-unlocked" options={{ gestureEnabled: false }} />
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
      <Stack.Screen name="categories" />
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
  useEffect(() => {
    if (loaded || error || !convex || !publishableKey) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!convex || !publishableKey)
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <ConfigNeeded />
        </ThemeProvider>
      </SafeAreaProvider>
    );
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <LocalEntryGate
            renderSignIn={(onSessionCreated) => (
              <PrebuiltSignIn onSessionCreated={onSessionCreated} />
            )}
          >
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
              <BottomSheetModalProvider>
                <SheetAccessibilityBoundary><Admission /></SheetAccessibilityBoundary>
              </BottomSheetModalProvider>
            </ConvexProviderWithClerk>
          </LocalEntryGate>
        </ClerkProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
