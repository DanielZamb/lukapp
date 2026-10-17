import * as React from "react";
import { createElement } from "react";
import { ActivityIndicator } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftsScreen } from "./DraftsScreen";
import type { DraftListItem } from "./localEntryDrafts";
import type { IntakeCandidate } from "./intake/candidates";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  TextInput: "input",
  ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

function text() {
  return (
    root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ??
    ""
  );
}

const expiresAt = Date.UTC(2026, 9, 17, 12);
const drafts: DraftListItem[] = [
  {
    id: "open-1",
    status: "open",
    kind: "normal",
    description: "",
    expiresAt,
    workspaceId: "workspace",
  },
  {
    id: "post-1",
    status: "posting",
    kind: "expense",
    description: "Food",
    expiresAt,
    workspaceId: "workspace",
  },
];
const candidate: IntakeCandidate = {
  id: "candidate-groceries",
  createdAt: expiresAt,
  expiresAt: expiresAt + 2 * 24 * 60 * 60 * 1000,
  workspaceId: "workspace",
  currency: "COP",
  suggestion: {
    direction: "out",
    description: "Groceries",
    amountMinorUnits: 126400,
    accountingDate: "2026-10-17",
    financialAccountProfileId: "daily",
    userCategoryIds: ["food"],
    primaryUserCategoryId: null,
  },
  parserVersion: "parser@1",
  consentVersion: "consent@1",
};

function render(
  props: Partial<React.ComponentProps<typeof DraftsScreen>> = {},
) {
  const defaults = {
    drafts: [],
    now: [] as IntakeCandidate[],
    wait: [] as IntakeCandidate[],
    ready: [] as IntakeCandidate[],
    readyTotal: 0,
    currency: "COP" as const,
    segment: "now" as const,
    readyToShow: true,
    error: "",
    confirming: false,
    onSegment: vi.fn(),
    onBack: vi.fn(),
    onResumeDraft: vi.fn(),
    onOpenCandidate: vi.fn(),
    onConfirmReady: vi.fn(),
    onMonthClose: vi.fn(),
  };
  return { ...defaults, ...props };
}

test("empty Drafts copy stays available and Month Close stays a footer", async () => {
  const onMonthClose = vi.fn();
  await act(async () => {
    root = create(
      createElement(DraftsScreen, render({ readyToShow: false, onMonthClose })),
    );
  });
  expect(root?.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  await act(async () => {
    root?.update(
      createElement(DraftsScreen, render({ onMonthClose })),
    );
  });
  expect(text()).toContain("No Drafts to review");
  expect(text()).toContain("The Drafts destination remains available.");
  expect(text()).toContain("Month Close");
  expect(text()).toContain("Needs you now");
  expect(text()).toContain("Can wait");
  const footer = root?.root
    .findAllByType("button")
    .find((node) => node.props.accessibilityLabel === "Month Close");
  await act(async () => footer?.props.onPress());
  expect(onMonthClose).toHaveBeenCalledOnce();
});

test("a Candidate row opens the shared form and Confirm all Ready posts the ready set", async () => {
  const onOpenCandidate = vi.fn();
  const onConfirmReady = vi.fn();
  const onResumeDraft = vi.fn();
  await act(async () => {
    root = create(
      createElement(
        DraftsScreen,
        render({
          drafts,
          now: [candidate],
          wait: [],
          ready: [candidate],
          readyTotal: 126400,
          onOpenCandidate,
          onConfirmReady,
          onResumeDraft,
        }),
      ),
    );
  });
  expect(text()).toContain("Groceries");
  expect(text()).toContain("Confirm all Ready");
  expect(text()).toContain("Needs you now · 2");
  const groceries = root?.root
    .findAllByType("button")
    .find((node) =>
      node.findAllByType("text").some((child) => child.children.includes("Groceries")),
    );
  await act(async () => groceries?.props.onPress());
  expect(onOpenCandidate).toHaveBeenCalledWith("candidate-groceries");
  const confirm = root?.root
    .findAllByType("button")
    .find((node) => node.props.accessibilityLabel === "Confirm all Ready");
  await act(async () => confirm?.props.onPress());
  expect(onConfirmReady).toHaveBeenCalledOnce();
  await act(async () => {
    root?.update(
      createElement(
        DraftsScreen,
        render({
          drafts,
          now: [candidate],
          segment: "wait",
          onResumeDraft,
        }),
      ),
    );
  });
  expect(text()).toContain("Incomplete draft");
});
