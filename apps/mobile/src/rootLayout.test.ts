import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as SecureStore from "expo-secure-store";

const report = vi.hoisted(() => vi.fn(() => false));
vi.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: "gesture-root" }));
vi.mock("@expo-google-fonts/geist", () => ({ useFonts: () => [true, null] }));
vi.mock("@clerk/expo", () => ({ ClerkProvider: "clerk", useAuth: () => ({}), useClerk: () => ({}) }));
vi.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
vi.mock("@gorhom/bottom-sheet", () => ({ BottomSheetModalProvider: "sheets" }));
vi.mock("convex/react", () => ({ ConvexReactClient: class {}, useConvexAuth: () => ({}), useQuery: () => undefined }));
vi.mock("convex/react-clerk", () => ({ ConvexProviderWithClerk: "convex" }));
vi.mock("expo-router", () => ({ Stack: Object.assign(() => null, { Screen: () => null }) }));
vi.mock("expo-splash-screen", () => ({ preventAutoHideAsync: async () => {}, hideAsync: async () => {} }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: "safe-area-provider", SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" }, KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 3 }),
  useColorScheme: () => "light",
  Appearance: { getColorScheme: () => "light", addChangeListener: () => ({ remove: () => {} }) },
}));
vi.mock("./local-auth/LocalEntryGate", () => ({ LocalEntryGate: "local-entry" }));
vi.mock("./local-auth/PrebuiltSignIn", () => ({ PrebuiltSignIn: "sign-in" }));
vi.mock("./local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => report }));
vi.mock("./features/intake/IntakeProvider", () => ({ IntakeProvider: "intake" }));
vi.mock("./device-admission/DeviceAdmissionGate", () => ({ DeviceAdmissionGate: "device-gate" }));
vi.mock("./features/feedback/FeedbackHost", () => ({ FeedbackHost: "feedback" }));
vi.mock("./features/feedback/controls", () => ({ FeedbackAdmission: "feedback-admission" }));
vi.mock("./features/api", () => ({ api: { authConnection: { connection: "connection" } } }));
import { ErrorBoundary } from "../app/_layout";

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  report.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  vi.unstubAllGlobals();
});

async function renderError(stored: string | null) {
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(stored);
  const retry = vi.fn(async () => {});
  const error = new Error("boom");
  await act(async () => { root = create(createElement(ErrorBoundary, { error, retry })); });
  return { retry, error };
}
const texts = () => root?.root.findAllByType("text").map((node) => node.children.join("")) ?? [];

test("the root error screen follows a stored Spanish choice and still reports the failure", async () => {
  const { retry, error } = await renderError("es");
  expect(texts()).toEqual(["No pudimos cargar tu plata", "Revisa tu conexión e intenta de nuevo.", "Intentar de nuevo"]);
  expect(report).toHaveBeenCalledWith(error);
  await act(async () => root?.root.findByProps({ accessibilityLabel: "Intentar de nuevo" }).props.onPress());
  expect(retry).toHaveBeenCalledOnce();
});

test("the root error screen keeps its English copy", async () => {
  await renderError("en");
  expect(texts()).toEqual(["Could not load your money", "Check your connection and try again.", "Try again"]);
});
