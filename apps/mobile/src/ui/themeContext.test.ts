import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ThemeProvider, useThemeContext } from "./themeContext";
import { readThemeMode, writeThemeMode } from "./themeModeStorage";
import { themes, type ThemeMode } from "./tokens";

vi.mock("./themeModeStorage", () => ({
  readThemeMode: vi.fn(),
  writeThemeMode: vi.fn(async () => {}),
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

function Appearance() {
  const { mode, theme, setMode } = useThemeContext();
  return createElement("button", {
    onClick: () => setMode("dark"),
    style: { backgroundColor: theme.background },
  }, mode);
}

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

test("hydrates the stored theme when the user has not chosen one", async () => {
  vi.mocked(readThemeMode).mockResolvedValue("dark");
  await act(async () => {
    root = create(createElement(ThemeProvider, null, createElement(Appearance)));
  });
  expect(root?.root.findByType("button").children).toEqual(["dark"]);
  expect(root?.root.findByType("button").props.style.backgroundColor).toBe(themes.dark.background);
});

test("a late stored Light theme cannot replace the user's newer Dark choice", async () => {
  let hydrate = (_mode: ThemeMode) => {};
  vi.mocked(readThemeMode).mockReturnValue(new Promise<ThemeMode>((resolve) => {
    hydrate = resolve;
  }));
  await act(async () => {
    root = create(createElement(ThemeProvider, null, createElement(Appearance)));
  });
  await act(async () => root?.root.findByType("button").props.onClick());
  expect(root?.root.findByType("button").children).toEqual(["dark"]);
  await act(async () => hydrate("light"));
  expect(root?.root.findByType("button").children).toEqual(["dark"]);
  expect(root?.root.findByType("button").props.style.backgroundColor).toBe(themes.dark.background);
  expect(writeThemeMode).toHaveBeenCalledExactlyOnceWith("dark");
});
