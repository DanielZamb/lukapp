import { afterEach, expect, test, vi } from "vitest";
import { createAppIconStore } from "./appIcons";

afterEach(() => { vi.useRealTimers(); });

test("rows asking in one tick share one native batch, and logos notify their rows", async () => {
  vi.useFakeTimers();
  const load = vi.fn(async (names: string[]) => Object.fromEntries(names.filter((name) => name !== "com.whatsapp").map((name) => [name, "iVBORw0KGgo="])));
  const store = createAppIconStore(load);
  const listener = vi.fn();
  store.subscribe(listener);
  store.request("com.nu.production"); store.request("com.whatsapp"); store.request("com.nu.production");
  expect(store.uri("com.nu.production")).toBeUndefined();
  await vi.runAllTimersAsync();
  expect(load).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledWith(["com.nu.production", "com.whatsapp"]);
  expect(store.uri("com.nu.production")).toBe("data:image/png;base64,iVBORw0KGgo=");
  expect(store.uri("com.whatsapp")).toBeUndefined();
  expect(listener).toHaveBeenCalledOnce();
  store.request("com.whatsapp");
  await vi.runAllTimersAsync();
  expect(load).toHaveBeenCalledOnce();
});

test("a failed draw keeps letters without retrying or notifying", async () => {
  vi.useFakeTimers();
  const load = vi.fn(async (_names: string[]): Promise<Record<string, string>> => { throw new Error("native"); });
  const store = createAppIconStore(load);
  const listener = vi.fn();
  store.subscribe(listener);
  for (let index = 0; index < 70; index += 1) store.request(`com.app.n${index}`);
  await vi.runAllTimersAsync();
  expect(load.mock.calls.map(([names]) => names.length)).toEqual([64, 6]);
  expect(store.uri("com.app.n1")).toBeUndefined();
  expect(listener).not.toHaveBeenCalled();
  store.request("com.app.n1");
  await vi.runAllTimersAsync();
  expect(load).toHaveBeenCalledTimes(2);
});
