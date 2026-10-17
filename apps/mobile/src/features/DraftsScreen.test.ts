import * as React from "react";
import { createElement } from "react";
import { ActivityIndicator } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftsScreen } from "./DraftsScreen";
import type { DraftListItem } from "./localEntryDrafts";

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
const items: DraftListItem[] = [
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

test("empty Drafts copy stays available and resume opens a row", async () => {
  const onResume = vi.fn();
  const onBack = vi.fn();
  await act(async () => {
    root = create(
      createElement(DraftsScreen, {
        items: [],
        ready: false,
        error: "",
        onBack,
        onResume,
      }),
    );
  });
  expect(root?.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(text()).not.toContain("No Drafts to review");
  await act(async () => {
    root?.update(
      createElement(DraftsScreen, {
        items: [],
        ready: true,
        error: "",
        onBack,
        onResume,
      }),
    );
  });
  expect(text()).toContain("No Drafts to review");
  expect(text()).toContain("The Drafts destination remains available.");
  const expires = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(expiresAt),
  );
  await act(async () => {
    root?.update(
      createElement(DraftsScreen, {
        items,
        ready: true,
        error: "",
        onBack,
        onResume,
      }),
    );
  });
  expect(text()).toContain("Incomplete draft");
  expect(text()).toContain("Food");
  expect(text()).toContain(`Retry posting · Expires ${expires}`);
  const resumeRow = root?.root
    .findAllByType("button")
    .filter((node) => node.props.accessibilityLabel !== "Back")[1];
  await act(async () => resumeRow?.props.onPress());
  expect(onResume).toHaveBeenCalledWith("post-1");
});
