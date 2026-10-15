import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PropsWithChildren } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { ClerkProvider, useAuth, useClerk, useSSO } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ConvexHttpClient } from "convex/browser";
import * as Crypto from "expo-crypto";
import { AccessController } from "./controller";
import type { Rpc } from "./controller";
import type { ProviderObservation } from "./lifecycle";
import { custody, nativeDeviceKey } from "./native";
import { createPostedActivitySource } from "../modules/posted-activity/source";
import { phoneTransport } from "../modules/posted-activity/phone";
import { PostedActivityProvider } from "../modules/posted-activity/PostedActivityProvider";
import { Copy, Header, PrimaryButton, Screen, SecondaryButton } from "../ui";
import { spacing, font } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InteractionContext } from "../ui/Interaction";
import { publicConfig } from "./public-config";
import { z } from "zod";
import { usePathname } from "expo-router";
import { requestScopedRpc } from "./request-scoped-rpc";
import { useSessionRpc } from "./use-session-rpc";

type Runtime = {
  controller: AccessController;
  posted: ReturnType<typeof createPostedActivitySource>;
  fixture: boolean;
};
const RuntimeContext = createContext<Runtime | null>(null);
export function useRuntime() {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error("Runtime provider required");
  return context;
}
export function useAccess() {
  const { controller } = useRuntime();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
const hash = { sha256Utf8: async (message: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, message) };
WebBrowser.maybeCompleteAuthSession();
function RuntimeSession({ children, rpc, observation, online, signOut, signIn, fixture }: PropsWithChildren<{
  rpc: Rpc; observation: ProviderObservation; online: boolean; signOut: () => Promise<void>; signIn: () => Promise<void>; fixture: boolean;
}>) {
  const [failure, setFailure] = useState<"storage" | "sign-in" | null>(null);
  const runtime = useMemo(() => {
    let clear = () => {};
    const controller = new AccessController({
      rpc, native: custody, hash, key: nativeDeviceKey,
      signOut, platform: Platform.OS === "ios" ? "ios" : "android",
      mode: fixture ? "fixture" : "live",
      clearMemory: () => clear(),
    });
    const posted = createPostedActivitySource(phoneTransport(controller));
    clear = () => posted.setScope({ kind: "unavailable", reason: "signed-out" });
    return { controller, posted, fixture };
  }, [rpc, signOut, fixture]);
  const state = useSyncExternalStore(runtime.controller.subscribe, runtime.controller.getSnapshot);
  const cleanup = useSyncExternalStore(runtime.controller.subscribe, runtime.controller.getProviderCleanup);
  const revocations = useSyncExternalStore(runtime.controller.subscribe, runtime.controller.getRevocations);
  const pathname = usePathname();
  useEffect(() => { if (pathname !== "/security") runtime.controller.leaveSecurity(); }, [pathname, runtime]);
  useEffect(() => {
    let stopped = false;
    void runtime.controller.start()
      .catch(() => { if (!stopped) setFailure("storage"); });
    const native = custody.addListener("change", () => runtime.controller.nativeChanged());
    const app = AppState.addEventListener("change", value => {
      if (value === "background" || (value === "inactive" && runtime.controller.getSnapshot().kind !== "checking")) runtime.controller.suspend();
    });
    return () => { stopped = true; native.remove(); app.remove(); runtime.controller.dispose(); };
  }, [runtime]);
  useLayoutEffect(() => { runtime.controller.observe(observation, online); }, [runtime, observation, online]);
  useEffect(() => {
    if (state.kind === "ready") runtime.posted.setScope({ kind: "connected", workspaceId: state.workspaceId });
    else runtime.posted.setScope({ kind: "unavailable", reason: online ? "signed-out" : "offline" });
  }, [state, online, runtime]);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [nativeProof, setNativeProof] = useState("");
  const allowed = state.kind === "ready" || state.kind === "provisioning";
  return (
    <RuntimeContext.Provider value={runtime}>
      <InteractionContext.Provider value={() => runtime.controller.activity()}>
      <PostedActivityProvider source={runtime.posted}>
        <View style={{ flex: 1 }} onTouchStart={() => runtime.controller.activity()}>
          {fixture && <Text style={{ color: theme.mutedForeground, fontFamily: font.medium, padding: spacing.sm, paddingTop: insets.top }} accessibilityRole="header">Controlled development fixture · Synthetic Owner</Text>}
          {allowed && (cleanup?.state.kind === "pending" || revocations.some(item => item.record.outcome.kind === "response-unknown" || item.record.outcome.result.kind === "pending")) && <Text style={{ color: theme.mutedForeground, fontFamily: font.medium, padding: spacing.sm }} accessibilityRole="alert">Device sign-out needs an online status check. Open Security for the last observed result.</Text>}
          {allowed ? children : (
            <Screen>
              <Header title="Lukapp" />
              <Copy title={observation.kind === "loading" ? "Opening Lukapp" : state.kind === "signed-out" ? "Your money, clearly" : "Your money stays private"}
                detail={failure === "storage" ? "This device could not open secure storage. Use a supported device with strong biometrics." :
                  failure === "sign-in" ? "Google sign-in did not finish. Try again online." :
                  observation.kind === "loading" ? "Waiting for secure sign-in to finish opening." :
                  state.kind === "wiping" ? "Removing local input and signing out." :
                  state.kind === "signed-out" ? "Sign in to connect your money securely." :
                  !online ? "Reconnect before unlocking. Your saved Drafts stay on this device." :
                  state.kind === "blocked" ? "Access needs a fresh online check. Unlock again or sign in." :
                  state.kind === "checking" ? "Checking your access." : "Unlock with your biometrics to continue."} />
              {state.kind === "signed-out" ? <PrimaryButton label={fixture ? "Sign in synthetic Owner" : "Continue with Google"} onPress={() => { setFailure(null); void signIn().catch(() => setFailure("sign-in")); }} /> :
                <PrimaryButton label={state.kind === "blocked" && state.code === "full_sign_in_required" ? "Full sign-in" : "Unlock"} loading={observation.kind === "loading" || state.kind === "checking" || state.kind === "wiping" || state.kind === "starting"}
                  disabled={!online || failure === "storage"} onPress={() => {
                    if (state.kind === "blocked" && state.code === "full_sign_in_required") void runtime.controller.wipe();
                    else void runtime.controller.admit();
                  }} />}
              {state.kind !== "signed-out" && <SecondaryButton label={state.kind === "blocked" ? "Clear local input and sign in" : "Sign out"}
                disabled={state.kind === "wiping"} onPress={() => { void runtime.controller.wipe(); }} />}
              {state.kind === "blocked" && online && observation.kind === "signed-in" && <>
                <Copy title="Recover access" detail="If your installation key or biometric enrollment changed, explicitly retire old bindings. Recovery signs you out, then requires a new full Google sign-in checked by the server." />
                <SecondaryButton label="Retire old bindings and recover" onPress={() => { void runtime.controller.beginRecovery().catch(() => {}); }} />
              </>}
              {fixture && __DEV__ && <>
                <Copy title="Development native evidence" detail={"State: " + state.kind + (state.kind === "blocked" ? " · " + state.code : "") + " · " + custody.state().protection +
                  " · Key present: " + custody.state().keyPresent + " · Input open: " + (custody.state().workspaceId !== null) + " · Wipe pending: " + custody.state().wipePending} />
                <SecondaryButton label="Check locked signing refusal" onPress={() => {
                  const native = custody.state();
                  void custody.sign("F03 locked signing probe", native.generation).then(() => setNativeProof("FAIL: signing unexpectedly succeeded")).catch(() => setNativeProof("Native signing refused while locked"));
                }} />
                <SecondaryButton label="Check closed input refusal" onPress={() => {
                  const native = custody.state();
                  void Promise.all([custody.inputList("draft", native.generation), custody.inputList("candidate", native.generation)])
                    .then(() => setNativeProof("FAIL: closed input unexpectedly opened")).catch(() => setNativeProof("Native encrypted input refused while closed"));
                }} />
                {nativeProof && <Copy title={nativeProof} />}
              </>}
            </Screen>
          )}
        </View>
      </PostedActivityProvider>
      </InteractionContext.Provider>
    </RuntimeContext.Provider>
  );
}
function LiveSession({ children, client }: PropsWithChildren<{ client: ConvexReactClient }>) {
  const { sessionId, sessionClaims, getToken, isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const { startSSOFlow } = useSSO();
  const [online, setOnline] = useState(client.connectionState().isWebSocketConnected);
  useEffect(() => client.subscribeToConnectionState(state => setOnline(state.isWebSocketConnected)), [client]);
  const audience = sessionClaims?.aud;
  const { rpc, signOut } = useSessionRpc(async () => {
    const token = await getToken({ skipCache: true, ...(audience === "convex" ? {} : { template: "convex" }) });
    if (!token) throw new Error("Online provider Session required");
    const request = new ConvexHttpClient(publicConfig.convexUrl, { logger: false });
    request.setAuth(token);
    return request;
  }, () => clerk.signOut());
  const signIn = async () => {
    const flow = await startSSOFlow({ strategy: "oauth_google", redirectUrl: AuthSession.makeRedirectUri({ scheme: "lukapp", path: "sso-callback" }) });
    if (flow.authSessionResult?.type === "cancel" || flow.authSessionResult?.type === "dismiss") return;
    if (!flow.createdSessionId || !flow.setActive) throw new Error("Sign-in did not finish");
    await flow.setActive({ session: flow.createdSessionId });
  };
  return <RuntimeSession rpc={rpc} observation={isLoaded && isSignedIn === false ? { kind: "signed-out" } : isLoaded && isSignedIn === true && sessionId ? { kind: "signed-in", sessionId } : { kind: "loading" }} online={online} signOut={signOut} signIn={signIn} fixture={false}>{children}</RuntimeSession>;
}
const fixtureObservation = z.object({ fixture: z.literal(true), sessionId: z.string().min(1).nullable(), online: z.boolean() });
function FixtureSession({ children }: PropsWithChildren) {
  const [observation, setObservation] = useState<z.infer<typeof fixtureObservation> | null>(null);
  const revision = useRef(0);
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const client = useMemo(() => requestScopedRpc(async () => new ConvexHttpClient("http://127.0.0.1:8094/" + platform, { skipConvexDeploymentUrlCheck: true, logger: false })), [platform]);
  const signOut = useMemo(() => async () => {
    revision.current++;
    const result = await fetch("http://127.0.0.1:8094/" + platform + "/sign-out", { method: "POST" });
    if (!result.ok) throw new Error("Fixture sign-out unavailable");
    setObservation(value => value ? { ...value, sessionId: null } : null);
  }, [platform]);
  useEffect(() => {
    let stopped = false;
    const observe = async () => {
      const expected = revision.current;
      try {
        const response = await fetch("http://127.0.0.1:8094/" + platform + "/resume");
        if (!response.ok) throw new Error("Fixture connection unavailable");
        const next = fixtureObservation.parse(await response.json());
        if (!stopped && revision.current === expected) setObservation(next);
      } catch {
        if (!stopped && revision.current === expected) setObservation(value => value ? { ...value, online: false } : null);
      }
    };
    void observe();
    const timer = setInterval(() => { void observe(); }, 1000);
    return () => { stopped = true; clearInterval(timer); };
  }, [platform]);
  const signIn = async () => {
    const expected = ++revision.current;
    const result = await fetch("http://127.0.0.1:8094/" + platform + "/sign-in", { method: "POST" });
    if (!result.ok) throw new Error("Fixture not running");
    const next = fixtureObservation.parse(await result.json());
    if (revision.current === expected) setObservation(next);
  };
  return <RuntimeSession rpc={client} observation={!observation ? { kind: "loading" } : observation.sessionId ? { kind: "signed-in", sessionId: observation.sessionId } : { kind: "signed-out" }} online={observation?.online ?? false} signOut={signOut} signIn={signIn} fixture>{children}</RuntimeSession>;
}
export function AccessRoot({ children }: PropsWithChildren) {
  const [fixture, setFixture] = useState(false);
  const key = publicConfig.publishableKey;
  const url = publicConfig.convexUrl;
  const client = useMemo(() => !fixture && url ? new ConvexReactClient(url, { logger: false }) : null, [url, fixture]);
  useEffect(() => () => { if (client) void client.close(); }, [client]);
  if (__DEV__ && fixture) return <View style={{ flex: 1 }}>
    <FixtureSession>{children}</FixtureSession>
    <SecondaryButton label="Return to live sign-in" onPress={() => setFixture(false)} />
  </View>;
  if (!key || !client) return <Screen>
    <Header title="Lukapp" />
    <Copy title="This build needs its connection" detail="Public sign-in and server configuration are not available in this build." />
    {__DEV__ && <PrimaryButton label="Enter controlled development fixture" onPress={() => setFixture(true)} />}
  </Screen>;
  return <View style={{ flex: 1 }}><ClerkProvider publishableKey={key} tokenCache={tokenCache}>
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <LiveSession client={client}>{children}</LiveSession>
    </ConvexProviderWithClerk>
  </ClerkProvider>
    {__DEV__ && <SecondaryButton label="Enter controlled development fixture" onPress={() => setFixture(true)} />}
  </View>;
}
