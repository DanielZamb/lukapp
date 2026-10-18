import * as React from "react";
import { createElement } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import MonthCloseRoute from "../../../app/month-close";

const source = vi.hoisted(() => {
  const intake: { count: number | null; error: string } = { count: 2, error: "" };
  return {
    query: vi.fn(),
    lock: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    lease: {},
    reportFailure: vi.fn(() => false),
    countMonth: vi.fn(),
    month: "2026-10",
    drafts: { monthCount: 0, error: "" },
    intake,
    locked: false,
    loading: false,
    plans: [{ dueMinorUnits: 23_000 }, { dueMinorUnits: 12_050 }],
  };
});
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({
  router: { push: source.push, replace: source.replace, back: source.back },
  useLocalSearchParams: () => ({ month: source.month }),
  Redirect: "redirect",
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: {
    id: "workspace", functionalCurrency: "COP",
    currentAccountingPeriod: { year: 2026, month: 10, status: source.locked ? "locked" : "open" },
  } }),
}));
vi.mock("convex/react", () => ({
  useAction: () => source.lock,
  useQuery: (ref: FunctionReference<"query">, input: unknown) => {
    const name = getFunctionName(ref);
    source.query(name, input);
    if (source.loading) return undefined;
    if (name === "accounting:postedActivity") return {
      monthSpendMinorUnits: 654_321, accounts: [{}, {}],
    };
    if (name === "savingsRecovery:evaluate") return { currency: "COP", plans: source.plans };
    throw new Error(`Unexpected query ${name}`);
  },
}));
vi.mock("../useLocalEntryDrafts", () => ({
  useLocalEntryDrafts: () => ({ ...source.drafts, countMonth: source.countMonth }),
}));
vi.mock("../useIntakeCandidates", () => ({ useIntakeCandidates: () => source.intake }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(async () => null) }));
vi.mock("../../local-auth/localInput", () => ({ useLocalInputLease: () => source.lease }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => source.reportFailure }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll",
  TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  source.month = "2026-10";
  source.loading = false;
  source.locked = false;
  source.intake.count = 2;
  source.intake.error = "";
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function text() {
  return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? "";
}
function row(title: string) {
  const found = root?.root.findAllByType("button").find((node) =>
    node.findAllByType("text").some((label) => label.children.join("") === title),
  );
  if (!found) throw new Error(`Missing button ${title}`);
  return found;
}

test("the route displays Convex query results and sends each review row to its destination", async () => {
  await act(async () => { root = create(createElement(MonthCloseRoute)); });
  expect(source.query).toHaveBeenCalledWith("accounting:postedActivity", {
    workspaceId: "workspace", month: "2026-10", includeRows: false,
  });
  expect(source.query).toHaveBeenCalledWith("savingsRecovery:evaluate", {
    workspaceId: "workspace", month: "2026-10",
  });
  expect(text()).toContain("October spending\nCOP 6.543,21");
  expect(text()).toContain("2 Financial Accounts checked");
  expect(text()).toContain("2 still local. Intake is not a statement.");
  expect(text()).toContain("COP 350,50 due this month");
  await act(async () => row("Notification Candidates").props.onPress());
  await act(async () => row("Account balances").props.onPress());
  await act(async () => row("Savings recovery").props.onPress());
  expect(source.replace.mock.calls).toEqual([["/drafts"], ["/overview"]]);
  expect(source.push.mock.calls).toEqual([["/recovery"]]);
  await act(async () => row("Complete and lock October").props.onPress());
  expect(text()).toContain("Keep reviewing");
  expect(source.lock).not.toHaveBeenCalled();
});

test("the requested month drives both Convex queries and preserves the mismatch screen", async () => {
  source.month = "2026-09";
  await act(async () => { root = create(createElement(MonthCloseRoute)); });
  expect(source.query).toHaveBeenCalledWith("accounting:postedActivity", {
    workspaceId: "workspace", month: "2026-09", includeRows: false,
  });
  expect(source.query).toHaveBeenCalledWith("savingsRecovery:evaluate", {
    workspaceId: "workspace", month: "2026-09",
  });
  expect(text()).toContain("Complete September");
  expect(text()).toContain("This device and the workspace do not agree on the current month yet.");
  expect(source.lock).not.toHaveBeenCalled();
});

test("unknown Convex data or Candidate counts stay loading and local read failures are visible", async () => {
  source.loading = true;
  await act(async () => { root = create(createElement(MonthCloseRoute)); });
  expect(root?.root.find((node) => String(node.type) === "spinner").props.accessibilityLabel).toBe("Loading month close");
  expect(text()).not.toContain("None waiting");
  source.loading = false;
  source.intake.count = null;
  await act(async () => root?.update(createElement(MonthCloseRoute)));
  expect(root?.root.find((node) => String(node.type) === "spinner").props.accessibilityLabel).toBe("Loading month close");
  source.intake.error = "Could not load Candidates on this device.";
  await act(async () => root?.update(createElement(MonthCloseRoute)));
  expect(text()).toContain("Could not load Candidates on this device.");
  expect(text()).not.toContain("None waiting");
});

test("the complete screen routes to overview and home without another lock", async () => {
  source.locked = true;
  await act(async () => { root = create(createElement(MonthCloseRoute)); });
  expect(text()).toContain("October is complete");
  await act(async () => row("View October overview").props.onPress());
  await act(async () => row("Back home").props.onPress());
  expect(source.replace.mock.calls).toEqual([["/overview"], ["/"]]);
  expect(source.lock).not.toHaveBeenCalled();
});
