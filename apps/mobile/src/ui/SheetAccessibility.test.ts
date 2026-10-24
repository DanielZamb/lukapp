import * as React from "react";
import { createElement as h, useEffect, useRef, type ComponentType, type PropsWithChildren } from "react";
import { createRequire } from "node:module";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useSheetAccessibility } from "./SheetAccessibility";
import { SheetProvider } from "./SheetProvider";

vi.mock("react-native", () => ({ View: "view" }));
vi.mock("@gorhom/bottom-sheet", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const bottomSheet = require.resolve("@gorhom/bottom-sheet/package.json");
  const { PortalProvider } = require(require.resolve("@gorhom/portal", { paths: [bottomSheet] }));
  return { BottomSheetModalProvider: PortalProvider };
});
const require = createRequire(import.meta.url);
const { Portal }: { Portal: ComponentType<PropsWithChildren<{ name: string }>> } = require(
  require.resolve("@gorhom/portal", { paths: [require.resolve("@gorhom/bottom-sheet/package.json")] }),
);

function Picker({ open }: { open: boolean }) {
  const id = useRef(Symbol("picker"));
  const { setPresented } = useSheetAccessibility();
  useEffect(() => {
    const key = id.current;
    setPresented(key, open);
    return () => setPresented(key, false);
  }, [open, setPresented]);
  return open ? h(Portal, { name: "picker" }, h("picker", null, "Category picker")) : null;
}
function hidden(node: ReactTestInstance): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "view" && (parent.props.importantForAccessibility === "no-hide-descendants" || parent.props.accessibilityElementsHidden)) return true;
  }
  return false;
}
let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

test.each([false, true])("active picker stays accessible with nested provider %s", async (nested) => {
  function App({ open }: { open: boolean }) {
    const content = h(React.Fragment, null, h("compose"), h(Picker, { open }));
    return h(SheetProvider, null, h("navigation"), nested ? h(SheetProvider, null, content) : content);
  }
  await act(async () => { root = create(h(App, { open: false })); });
  if (!root) throw new Error("Renderer was not created");
  expect(hidden(root.root.find((node) => String(node.type) === "compose"))).toBe(false);
  for (const open of [true, false, true]) {
    await act(async () => root?.update(h(App, { open })));
    expect(hidden(root.root.find((node) => String(node.type) === "compose"))).toBe(open);
    expect(hidden(root.root.find((node) => String(node.type) === "navigation"))).toBe(open && !nested);
    if (open) expect(hidden(root.root.find((node) => String(node.type) === "picker"))).toBe(false);
    else expect(root.root.findAll((node) => String(node.type) === "picker")).toHaveLength(0);
  }
});
