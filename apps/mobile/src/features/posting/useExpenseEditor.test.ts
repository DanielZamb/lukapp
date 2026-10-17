import { requiresLocalWipe } from "../../local-auth/accessFailure";
import {
  LocalInputLease,
  drainLocalInputWrites,
  runLocalInputWrite,
} from "../../local-auth/localInput";
import { ConvexError } from "convex/values";
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

for (const code of [
  "authentication_required",
  "owner_required",
  "session_required",
  "session_inactive",
  "provider_unavailable",
  "session_verification_required",
  "device_registration_required",
  "device_revoked",
  "membership_required",
  "permission_denied",
  "device_slot_occupied",
  "device_conflict",
  "device_metadata_invalid",
  "device_not_found",
  "session_owner_mismatch",
  "unknown_future_guard",
]) {
  test(`${code} after an uncertain post retains its exact category payload and key until acknowledgement`, async () => {
    const api = transport();
    api.post.mockRejectedValueOnce(new Error("response lost"));
    api.post.mockRejectedValueOnce(new ConvexError({ code }));
    const editor = await open(api);
    await act(async () => {
      editor().setAmount("-1.500,00");
      editor().setDescription("Food");
      editor().setUserCategoryId("food-category");
    });
    await act(async () => {
      await editor().submit();
    });
    const original = api.post.mock.calls[0][0];
    await act(async () => {
      await editor().submit();
    });
    expect(editor().pending).toBe(true);
    expect(editor().editable).toBe(false);
    expect(editor().userCategoryId).toBe("food-category");
    expect(editor().posted).toBeNull();
    expect(api.clear).not.toHaveBeenCalled();
    expect(api.post.mock.calls[1][0]).toEqual(original);
    await act(async () => {
      await editor().submit();
    });
    expect(api.post.mock.calls[2][0]).toEqual(original);
    expect(editor().posted?.description).toBe("Food");
    expect(editor().pending).toBe(false);
    expect(api.clear).toHaveBeenCalledOnce();
  });
}

test("only an explicitly classified accounting rejection unlocks an expense for correction", async () => {
  const api = transport();
  api.post.mockRejectedValueOnce(
    new ConvexError({
      kind: "accounting",
      code: "locked_period",
      message: "Locked Period",
    }),
  );
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
    editor().setUserCategoryId("food-category");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(editor().pending).toBe(false);
  expect(editor().editable).toBe(true);
  expect(editor().userCategoryId).toBe("food-category");
  expect(api.clear).toHaveBeenCalledOnce();
  expect(editor().posted).toBeNull();
});

test("a framework validation error without an accounting marker keeps uncertainty", async () => {
  const api = transport();
  api.post.mockRejectedValueOnce(new ConvexError("Argument validation failed"));
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(editor().pending).toBe(true);
  expect(editor().editable).toBe(false);
  expect(api.clear).not.toHaveBeenCalled();
});

for (const code of [
  "session_inactive",
  "device_revoked",
  "membership_required",
]) {
  test(`${code} with a confirmed wipe signal hands cleanup over without editor-owned deletion`, async () => {
    const reportFailure = vi.fn((error: unknown) => requiresLocalWipe(error));
    const api = { ...transport(), reportFailure };
    const denied = new ConvexError({ code, wipeLocalInput: true });
    api.post.mockRejectedValueOnce(denied);
    const editor = await open(api);
    await act(async () => {
      editor().setAmount("-1,00");
      editor().setUserCategoryId("food-category");
    });
    await act(async () => {
      await editor().submit();
    });
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(denied);
    expect(api.clear).not.toHaveBeenCalled();
    expect(editor().posted).toBeNull();
    expect(editor().pending).toBe(true);
    expect(editor().error).toBe("");
  });
}

test("a failed acknowledgement delete keeps the same payload and key for safe retry", async () => {
  const api = transport();
  api.clear.mockRejectedValueOnce(new Error("Storage delete failed"));
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
    editor().setUserCategoryId("food-category");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(editor().pending).toBe(true);
  expect(editor().editable).toBe(false);
  expect(editor().posted).toBeNull();
  await act(async () => {
    await editor().submit();
  });
  expect(api.post.mock.calls[1][0]).toEqual(api.post.mock.calls[0][0]);
  expect(editor().posted?.amount.minorUnits).toBe(100);
  expect(editor().pending).toBe(false);
});

test("a late post response cannot clear the pending entry of a new admission", async () => {
  const oldLease = new LocalInputLease("late-response-owner", "old-session");
  const newLease = new LocalInputLease("late-response-owner", "new-session");
  let stored = "";
  let acknowledge: (receipt: {
    description: string;
    amount: {
      currency: PendingExpense["amount"]["currency"];
      minorUnits: number;
    };
  }) => void = () => {};
  const response = new Promise<{
    description: string;
    amount: {
      currency: PendingExpense["amount"]["currency"];
      minorUnits: number;
    };
  }>((resolve) => {
    acknowledge = resolve;
  });
  const api = {
    ...transport(),
    save: (payload: PendingExpense) =>
      runLocalInputWrite(oldLease, async () => {
        stored = payload.idempotencyKey;
      }),
    clear: () =>
      runLocalInputWrite(oldLease, async () => {
        stored = "";
      }),
  };
  api.post.mockImplementationOnce(() => response);
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
  });
  let submission: Promise<void> | undefined;
  await act(async () => {
    submission = editor().submit();
    await Promise.resolve();
  });
  expect(api.post).toHaveBeenCalledOnce();
  oldLease.deny();
  await drainLocalInputWrites(oldLease.subject);
  stored = "";
  await runLocalInputWrite(newLease, async () => {
    stored = "new-admission-key";
  });
  await act(async () => {
    acknowledge({
      description: "Old expense",
      amount: { currency: "COP", minorUnits: 100 },
    });
    await submission;
  });
  expect(stored).toBe("new-admission-key");
  expect(editor().posted).toBeNull();
  expect(editor().pending).toBe(true);
});

test("an old mounted transport cannot save or start another post after its lease is denied", async () => {
  const lease = new LocalInputLease("late-save-owner", "old-session");
  let stored = "new-admission-key";
  const api = {
    ...transport(),
    save: (payload: PendingExpense) =>
      runLocalInputWrite(lease, async () => {
        stored = payload.idempotencyKey;
      }),
    clear: () =>
      runLocalInputWrite(lease, async () => {
        stored = "";
      }),
  };
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
  });
  lease.deny();
  await act(async () => {
    await editor().submit();
  });
  expect(stored).toBe("new-admission-key");
  expect(api.post).not.toHaveBeenCalled();
  expect(editor().posted).toBeNull();
});
