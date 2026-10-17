import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { useExpenseEditor, type ExpenseTransport } from "./useExpenseEditor";
import type { PendingExpense } from "../pendingExpense";

const account = {
  workspaceId: "workspace",
  financialAccountProfileId: "cash",
  currency: "COP",
} as const;
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
async function open(transport: ExpenseTransport) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof useExpenseEditor> | undefined;
  function Harness() {
    editor = useExpenseEditor(account, transport);
    return null;
  }
  await act(async () => {
    root = create(createElement(Harness));
  });
  return () => {
    if (!editor) throw new Error("Editor not mounted");
    return editor;
  };
}
function transport() {
  let key = 0;
  return {
    load: vi.fn(async (): Promise<PendingExpense | null> => null),
    save: vi.fn(async (_payload: PendingExpense) => {}),
    post: vi.fn(async (payload: PendingExpense) => ({
      description: payload.description,
      amount: payload.amount,
    })),
    clear: vi.fn(async () => {}),
    newKey: () => `expense-${++key}`,
  } satisfies ExpenseTransport;
}

test("acknowledgement clears the entry and shows Posted on the same editor; Done dismisses only the banner", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1.500,00");
    editor().setDescription("Groceries");
    editor().setDate("2026-10-17");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(editor().posted).toEqual({
    description: "Groceries",
    amount: { currency: "COP", minorUnits: 150000 },
  });
  expect(editor().amount).toBe("-");
  expect(editor().description).toBe("");
  expect(editor().date).toBe("2026-10-17");
  expect(editor().pending).toBe(false);
  expect(editor().editable).toBe(true);
  expect(editor().canSubmit).toBe(false);
  expect(api.clear).toHaveBeenCalledOnce();
  await act(async () => editor().dismissPosted());
  expect(editor().posted).toBeNull();
  expect(editor().amount).toBe("-");
  expect(api.post).toHaveBeenCalledOnce();
  await act(async () => {
    editor().setAmount("-2,50");
    editor().setDescription("Coffee");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(
    api.post.mock.calls.map(([p]) => [p.amount.minorUnits, p.idempotencyKey]),
  ).toEqual([
    [150000, "expense-1"],
    [250, "expense-2"],
  ]);
});

test("an uncertain response keeps the entry locked and retries its exact saved payload before showing Posted", async () => {
  const api = transport();
  api.post.mockRejectedValueOnce(new Error("Network interrupted"));
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1.234,50");
    editor().setDescription("Food");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(editor().posted).toBeNull();
  expect(editor().amount).toBe("-1.234,50");
  expect(editor().pending).toBe(true);
  expect(editor().editable).toBe(false);
  expect(api.clear).not.toHaveBeenCalled();
  await act(async () => {
    await editor().submit();
  });
  expect(api.post.mock.calls[1][0]).toEqual(api.post.mock.calls[0][0]);
  expect(editor().posted?.amount).toEqual({
    currency: "COP",
    minorUnits: 123450,
  });
  expect(editor().pending).toBe(false);
});

test("a restored pending expense is acknowledged without generating a new key or double-submitting", async () => {
  const api = transport();
  const saved: PendingExpense = {
    workspaceId: "workspace",
    financialAccountProfileId: "cash",
    amount: { currency: "COP", minorUnits: 500 },
    accountingDate: "2026-10-16",
    description: "Bus",
    idempotencyKey: "saved-key",
  };
  api.load.mockResolvedValue(saved);
  const editor = await open(api);
  expect(editor().description).toBe("Bus");
  expect(editor().editable).toBe(false);
  await act(async () => {
    await Promise.all([editor().submit(), editor().submit()]);
  });
  expect(api.post).toHaveBeenCalledExactlyOnceWith(saved);
  expect(editor().posted).toEqual({
    description: "Bus",
    amount: { currency: "COP", minorUnits: 500 },
  });
});

test("an uncertain category expense locks selection and retries the exact category, then clears it on Posted", async () => {
  const api = transport();
  api.post.mockRejectedValueOnce(new Error("Network interrupted"));
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1.500,00");
    editor().setDescription("Food");
    editor().setUserCategoryId("food-category");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(api.post.mock.calls[0][0]).toMatchObject({
    userCategoryId: "food-category",
    idempotencyKey: "expense-1",
  });
  await act(async () => {
    editor().setUserCategoryId("other-category");
  });
  expect(editor().userCategoryId).toBe("food-category");
  expect(editor().editable).toBe(false);
  await act(async () => {
    await editor().submit();
  });
  expect(api.post.mock.calls[1][0]).toEqual(api.post.mock.calls[0][0]);
  expect(editor().posted?.description).toBe("Food");
  expect(editor().userCategoryId).toBeNull();
  await act(async () => {
    editor().dismissPosted();
  });
  expect(editor().posted).toBeNull();
  expect(api.post).toHaveBeenCalledTimes(2);
});

test("restoring a saved expense retains its category and sends it with the original idempotency key", async () => {
  const api = transport();
  const saved: PendingExpense = {
    ...account,
    amount: { currency: "COP", minorUnits: 500 },
    accountingDate: "2026-10-16",
    description: "Bus",
    idempotencyKey: "saved-key",
    userCategoryId: "transport-category",
  };
  api.load.mockResolvedValue(saved);
  const editor = await open(api);
  expect(editor().userCategoryId).toBe("transport-category");
  expect(editor().editable).toBe(false);
  await act(async () => {
    await editor().submit();
  });
  expect(api.post).toHaveBeenCalledExactlyOnceWith(saved);
  expect(editor().userCategoryId).toBeNull();
});
