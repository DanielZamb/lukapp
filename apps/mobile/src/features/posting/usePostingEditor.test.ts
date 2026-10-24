import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";
import {
  LocalInputLease,
  runLocalInputWrite,
} from "../../local-auth/localInput";
import {
  parsePendingPosting,
  type PendingPosting,
} from "./pendingPostingSchema";
import {
  usePostingEditor,
  type LoadResult,
  type PostingTransport,
} from "./usePostingEditor";

const account = {
  workspaceId: "workspace",
  financialAccountProfileId: "bank",
  currency: "COP",
  timeZone: "America/Bogota",
} as const;
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function transport() {
  let key = 0;
  return {
    load: vi.fn(async (): Promise<LoadResult> => ({ kind: "none" })),
    save: vi.fn(async (entry: PendingPosting, draftId?: string) => ({
      id: draftId ?? `saved-${key || 1}`,
      command: entry,
    })),
    post: vi.fn(async (entry: PendingPosting) => ({
      description:
        "description" in entry.payload
          ? entry.payload.description
          : entry.payload.name,
      amount: entry.payload.amount,
      ...(entry.kind === "setup"
        ? { financialAccountProfileId: "new-card" }
        : {}),
    })),
    clear: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    newKey: () => `entry-${++key}`,
  } satisfies PostingTransport;
}
async function open(
  api: PostingTransport,
  timeZone: string = account.timeZone,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof usePostingEditor> | undefined;
  function Harness() {
    editor = usePostingEditor({ ...account, timeZone }, api);
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
const common = {
  workspaceId: "workspace",
  amount: { currency: "COP", minorUnits: 125000 },
  accountingDate: "2026-10-17",
  description: "Example",
  idempotencyKey: "saved-key",
} as const;
const entries: PendingPosting[] = [
  {
    kind: "income",
    payload: {
      ...common,
      financialAccountProfileId: "bank",
      userCategoryIds: ["salary", "household"],
      primaryUserCategoryId: "salary",
    },
  },
  {
    kind: "transfer",
    payload: {
      ...common,
      sourceFinancialAccountProfileId: "bank",
      destinationFinancialAccountProfileId: "card",
    },
  },
  {
    kind: "opening",
    payload: { ...common, financialAccountProfileId: "card" },
  },
  {
    kind: "setup",
    payload: {
      workspaceId: "workspace",
      amount: { currency: "COP", minorUnits: 0 },
      accountingDate: "2026-10-16",
      idempotencyKey: "setup-key",
      name: "New card",
      productKind: "creditCard",
    },
  },
];

for (const saved of entries) {
  test(`${saved.kind} restores and locks its exact command across a lost reply, guard error and retry`, async () => {
    const api = transport();
    api.load.mockResolvedValue({
      kind: "pending",
      id: saved.payload.idempotencyKey,
      command: saved,
    });
    api.post.mockRejectedValueOnce(new Error("Response lost"));
    api.post.mockRejectedValueOnce(
      new ConvexError({ code: "provider_unavailable" }),
    );
    const editor = await open(api);
    expect(editor().editable).toBe(false);
    for (let attempt = 0; attempt < 3; attempt++) {
      await act(async () => {
        editor().setAmount("-2,00");
        editor().setDescription("Changed");
        editor().setDate("2020-01-01");
        editor().setProfileId("other");
        editor().setDestinationId("other");
        editor().setEntryType("normal");
        editor().setSetup({
          name: "Changed",
          productKind: "cash",
          amount: "9",
          date: "2020-01-01",
        });
        await Promise.all([editor().submit(), editor().submit()]);
      });
      expect(api.post.mock.calls[attempt][0]).toEqual(saved);
      if (attempt < 2) {
        expect(editor().pending).toBe(true);
        expect(api.clear).not.toHaveBeenCalled();
      }
    }
    expect(api.post).toHaveBeenCalledTimes(3);
    expect(editor().pending).toBe(false);
    if (saved.kind === "setup") expect(editor().posted).toBeNull();
    else expect(editor().posted?.amount).toEqual(saved.payload.amount);
    expect(editor().setup).toBeNull();
    if (saved.kind === "setup") expect(editor().profileId).toBe("new-card");
  });
}

test("a selected category controls the sign during selection and later amount edits", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => editor().setAmount("-1.250,00"));
  await act(async () => editor().setCategories({ ids: ["salary"], primaryId: null }, "Income"));
  expect(editor().amount).toBe("+1.250,00");
  await act(async () => editor().setAmount("-27,50"));
  expect(editor().amount).toBe("+27,50");
  expect(editor().categories.ids).toEqual(["salary"]);
  await act(async () => editor().setCategories({ ids: ["food"], primaryId: null }, "Expense"));
  expect(editor().amount).toBe("-27,50");
  await act(async () => editor().setAmount("+2.000,"));
  expect(editor().amount).toBe("-2.000,");
  expect(editor().categories.ids).toEqual(["food"]);
  await act(async () => editor().setCategories({ ids: [], primaryId: null }, null));
  await act(async () => editor().setAmount("+3"));
  expect(editor().amount).toBe("+3");
  expect(api.save).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
});

test("signed Normal uses income/expense and clears categories when direction changes", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
    editor().setCategories({ ids: ["food"], primaryId: null });
  });
  await act(async () => editor().setAmount("+1.250,00"));
  expect(editor().categories.ids).toEqual([]);
  expect(editor().direction).toBe("in");
  await act(async () => {
    editor().setCategories({ ids: ["salary"], primaryId: null });
    editor().setDate("2026-10-17");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(api.post.mock.calls[0][0]).toEqual({
    kind: "income",
    payload: {
      workspaceId: "workspace",
      financialAccountProfileId: "bank",
      amount: { currency: "COP", minorUnits: 125000 },
      accountingDate: "2026-10-17",
      description: "",
      idempotencyKey: "entry-1",
      userCategoryIds: ["salary"],
    },
  });
  expect(editor().amount).toBe("-");
  await act(async () => {
    editor().setAmount("-3,00");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(api.post.mock.calls[1][0]).toMatchObject({
    kind: "expense",
    payload: { amount: { minorUnits: 300 }, idempotencyKey: "entry-2" },
  });
});

test("transfer requires different places, clears prior Normal categories and preserves source/destination and magnitude", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => {
    editor().setCategories({ ids: ["food"], primaryId: null });
    editor().setEntryType("transfer");
    editor().setAmount("-1.250,00");
  });
  expect(editor().categories.ids).toEqual([]);
  expect(editor().canSubmit).toBe(false);
  await act(async () => editor().setDestinationId("bank"));
  expect(editor().canSubmit).toBe(false);
  await act(async () => {
    editor().setDestinationId("card");
    editor().setDate("2026-10-17");
    editor().setDescription("Pay card");
  });
  expect(editor().canSubmit).toBe(false);
  await act(async () => editor().confirmTransferReview());
  await act(async () => {
    await editor().submit();
  });
  expect(api.post.mock.calls[0][0]).toEqual({
    kind: "transfer",
    payload: {
      workspaceId: "workspace",
      sourceFinancialAccountProfileId: "bank",
      destinationFinancialAccountProfileId: "card",
      amount: { currency: "COP", minorUnits: 125000 },
      accountingDate: "2026-10-17",
      description: "Pay card",
      idempotencyKey: "entry-1",
    },
  });
});

test("opening accepts zero, rejects a negative amount and preserves its chosen date and profile", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => {
    editor().setEntryType("initial");
    editor().setAmount("-1");
  });
  expect(editor().canSubmit).toBe(false);
  await act(async () => {
    editor().setProfileId("loan");
    editor().setAmount("0");
    editor().setDate("2026-10-16");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(api.post.mock.calls[0][0]).toEqual({
    kind: "opening",
    payload: {
      workspaceId: "workspace",
      financialAccountProfileId: "loan",
      amount: { currency: "COP", minorUnits: 0 },
      accountingDate: "2026-10-16",
      description: "",
      idempotencyKey: "entry-1",
    },
  });
});

test("a setup saves all classification facts before posting and leaves a definitive rejection editable", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () =>
    editor().setSetup({
      name: "Card",
      productKind: "creditCard",
      amount: "-1",
      date: "2026-10-17",
    }),
  );
  expect(editor().canSubmit).toBe(false);
  await act(async () =>
    editor().setSetup({
      name: "Card",
      productKind: "creditCard",
      amount: "12,50",
      date: "2026-10-16",
    }),
  );
  api.post.mockRejectedValueOnce(
    new ConvexError({
      kind: "accounting",
      code: "locked_period",
      message: "Locked Period",
    }),
  );
  await act(async () => {
    await editor().submit();
  });
  expect(api.save.mock.calls[0][0]).toEqual({
    kind: "setup",
    payload: {
      workspaceId: "workspace",
      name: "Card",
      productKind: "creditCard",
      amount: { currency: "COP", minorUnits: 1250 },
      accountingDate: "2026-10-16",
      idempotencyKey: "entry-1",
    },
  });
  expect(api.save.mock.invocationCallOrder[0]).toBeLessThan(
    api.post.mock.invocationCallOrder[0],
  );
  expect(editor().editable).toBe(true);
  expect(editor().setup?.name).toBe("Card");
  expect(editor().error).toBe("Locked Period");
});

test("a late setup acknowledgement cannot clear a new admission's saved transfer", async () => {
  const oldLease = new LocalInputLease("owner", "old-session");
  const newLease = new LocalInputLease("owner", "new-session");
  let stored: PendingPosting | null = null;
  let acknowledge = () => {};
  const api = {
    ...transport(),
    save: async (entry: PendingPosting) => {
      await runLocalInputWrite(oldLease, async () => {
        stored = entry;
      });
      return { id: "setup-row", command: entry };
    },
    clear: () =>
      runLocalInputWrite(oldLease, async () => {
        stored = null;
      }),
    abort: () =>
      runLocalInputWrite(oldLease, async () => {
        stored = null;
      }),
  };
  api.post.mockImplementationOnce(
    (entry) =>
      new Promise((resolve) => {
        acknowledge = () =>
          resolve({
            description: "Card",
            amount: entry.payload.amount,
            financialAccountProfileId: "new-card",
          });
      }),
  );
  const editor = await open(api);
  await act(async () =>
    editor().setSetup({
      name: "Card",
      productKind: "creditCard",
      amount: "0",
      date: "2026-10-17",
    }),
  );
  let submission: Promise<void> | undefined;
  await act(async () => {
    submission = editor().submit();
  });
  oldLease.deny();
  const next = entries[1];
  await runLocalInputWrite(newLease, async () => {
    stored = next;
  });
  await act(async () => {
    acknowledge();
    await submission;
  });
  expect(stored).toEqual(next);
  expect(editor().pending).toBe(true);
  expect(editor().posted).toBeNull();
});

test("the shared storage schema reads legacy expenses and every new pending kind without losing keys", () => {
  const legacy = {
    ...common,
    financialAccountProfileId: "bank",
    userCategoryIds: ["a", "b", "c"],
    primaryUserCategoryId: "b",
  };
  expect(parsePendingPosting(legacy)).toEqual({
    kind: "expense",
    payload: legacy,
  });
  for (const entry of entries)
    expect(parsePendingPosting(JSON.parse(JSON.stringify(entry)))).toEqual(
      entry,
    );
  expect(() =>
    parsePendingPosting({ kind: "transfer", payload: legacy }),
  ).toThrow();
});

test("a fresh editor defaults the accounting date to the Workspace calendar day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T23:30:00-05:00"));
  const bogota = await open(transport(), "America/Bogota");
  expect(bogota().date).toBe("2026-10-31");
  await act(async () => root?.unmount());
  root = undefined;
  const auckland = await open(transport(), "Pacific/Auckland");
  expect(auckland().date).toBe("2026-11-01");
  vi.useRealTimers();
});

test("restored setup from To selects the new destination and keeps its original source", async () => {
  const api = transport();
  api.load.mockResolvedValue({
    kind: "pending",
    id: "destination-setup",
    command: {
      kind: "setup",
      target: { kind: "destination", sourceProfileId: "original-bank" },
      payload: {
        workspaceId: "workspace",
        amount: { currency: "COP", minorUnits: 0 },
        accountingDate: "2026-10-17",
        idempotencyKey: "destination-setup",
        name: "Card",
        productKind: "creditCard",
      },
    },
  });
  const editor = await open(api);
  await act(async () => {
    await editor().submit();
  });
  expect(editor().profileId).toBe("original-bank");
  expect(editor().destinationId).toBe("new-card");
  expect(editor().entryType).toBe("transfer");
});

test("an accounting rejection after leaving the screen still reopens the draft", async () => {
  const api = transport();
  let reject: (error: unknown) => void = () => {};
  api.post.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-12,50");
    editor().setDescription("Taxi");
  });
  let submitted: Promise<void> | undefined;
  await act(async () => {
    submitted = editor().submit();
  });
  await act(async () => root?.unmount());
  root = undefined;
  reject(new ConvexError({ kind: "accounting", code: "locked_period", message: "Locked Period" }));
  await submitted;
  expect(api.abort).toHaveBeenCalledTimes(1);
  expect(api.clear).not.toHaveBeenCalled();
});

test("opening a posting row chosen from Drafts asks the transport for that row", async () => {
  const api = transport();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function Harness() {
    usePostingEditor(account, api, { draftId: "row-b" });
    return null;
  }
  await act(async () => {
    root = create(createElement(Harness));
  });
  expect(api.load).toHaveBeenCalledWith("row-b", true);
});

test("adding a zero-balance place carries its emoji and preserves the entry being composed", async () => {
  const api = transport();
  const editor = await open(api);
  expect(editor().categories).toEqual({ ids: [], primaryId: null });
  await act(async () => {
    editor().setAmount("-12,50");
    editor().setDescription("Taxi");
    editor().setDate("2026-10-16");
    editor().setSetup({
      name: "Travel",
      productKind: "cash",
      emoji: "👛",
      amount: "0",
      date: "2026-10-18",
      target: { kind: "source" },
    });
  });
  expect(editor().canSubmit).toBe(true);
  await act(async () => {
    await editor().submit();
  });
  expect(api.post).toHaveBeenCalledWith({
    kind: "setup",
    target: { kind: "source" },
    payload: {
      workspaceId: "workspace",
      name: "Travel",
      productKind: "cash",
      emoji: "👛",
      amount: { currency: "COP", minorUnits: 0 },
      accountingDate: "2026-10-18",
      idempotencyKey: "entry-1",
    },
  });
  expect(editor().amount).toBe("-12,50");
  expect(editor().description).toBe("Taxi");
  expect(editor().date).toBe("2026-10-16");
  expect(editor().profileId).toBe("new-card");
  expect(editor().setup).toBeNull();
  expect(editor().posted).toBeNull();
});

test("Transfer persists its selected categories through retry hydration", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => {
    editor().setEntryType("transfer");
    editor().setAmount("-25");
    editor().setDestinationId("wallet");
    editor().setCategories({ ids: ["travel"], primaryId: "travel" });
  });
  api.post.mockRejectedValueOnce(new Error("Reply lost"));
  await act(async () => {
    await editor().submit();
  });
  const command = api.save.mock.calls[0][0];
  expect(command).toMatchObject({
    kind: "transfer",
    payload: { userCategoryIds: ["travel"], primaryUserCategoryId: "travel" },
  });
  expect(parsePendingPosting(command)).toEqual(command);
  await act(async () => root?.unmount());
  api.load.mockResolvedValue({ kind: "pending", id: "transfer", command });
  const resumed = await open(api);
  expect(resumed().categories).toEqual({
    ids: ["travel"],
    primaryId: "travel",
  });
});


test.each(["+125,00", "-125,00"])("account door preserves %s and requires explicit transfer review after place creation", async (amount) => {
  const api = transport();
  const editor = await open(api);
  await act(async () => {
    editor().setAmount(amount);
    editor().setDescription("Savings move");
    editor().setDate("2026-10-17");
    editor().setCategories({ ids: ["food"], primaryId: null });
  });
  await act(async () => { editor().beginAccountSetup({ name: "Rainy day", answer: "stillMine", style: { emoji: "🏦", tone: "primary" } }); });
  expect(editor().entryType).toBe("transfer");
  expect(editor().categories.ids).toEqual([]);
  expect(editor().setup?.amount).toBe("0");
  await act(async () => editor().submit());
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(editor().amount).toBe(amount);
  expect(editor().description).toBe("Savings move");
  expect(editor().date).toBe("2026-10-17");
  expect(editor().profileId).toBe("bank");
  expect(editor().destinationId).toBe("new-card");
  expect(editor().canSubmit).toBe(false);
  await act(async () => editor().submit());
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => editor().confirmTransferReview());
  expect(editor().canSubmit).toBe(true);
  await act(async () => editor().submit());
  expect(api.post.mock.calls[1][0]).toMatchObject({ kind: "transfer", payload: {
    sourceFinancialAccountProfileId: "bank", destinationFinancialAccountProfileId: "new-card", amount: { minorUnits: 12500 },
  } });
});

test("debt requires a chosen product; cancellation leaves an incomplete transfer", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => editor().setAmount("-25"));
  await act(async () => { editor().beginAccountSetup({ name: "Debt", answer: "payDebt", style: { emoji: "💳", tone: "primary" } }); });
  expect(editor().setup?.productKind).toBeNull();
  expect(editor().canSubmit).toBe(false);
  await act(async () => editor().submit());
  expect(api.save).not.toHaveBeenCalled();
  await act(async () => editor().setSetup(null));
  expect(editor().entryType).toBe("transfer");
  expect(editor().destinationId).toBeNull();
  expect(editor().amount).toBe("-25");
  expect(editor().canSubmit).toBe(false);
});


test("explicit swap reverses an incoming transfer and still requires separate confirmation", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("+125,00");
    editor().setDescription("From Savings");
    editor().setDate("2026-10-17");
  });
  await act(async () => { editor().beginAccountSetup({ name: "Savings", answer: "stillMine", style: { emoji: "S", tone: "primary" } }); });
  await act(async () => editor().submit());
  await act(async () => editor().swapTransferPlaces());
  expect(editor()).toMatchObject({ amount: "+125,00", description: "From Savings", date: "2026-10-17", profileId: "new-card", destinationId: "bank", transferReviewRequired: true, canSubmit: false });
  await act(async () => editor().submit());
  expect(api.post).toHaveBeenCalledOnce();
  await act(async () => editor().confirmTransferReview());
  await act(async () => editor().submit());
  expect(api.post.mock.calls[1][0]).toEqual({ kind: "transfer", payload: {
    workspaceId: "workspace", sourceFinancialAccountProfileId: "new-card", destinationFinancialAccountProfileId: "bank",
    amount: { currency: "COP", minorUnits: 12500 }, accountingDate: "2026-10-17", description: "From Savings", idempotencyKey: "entry-2",
  } });
});

test.each(["source", "destination"])("changing the confirmed transfer %s requires confirmation of the new pair", async (changed) => {
  const api = transport();
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-10");
    editor().setEntryType("transfer");
    editor().setDescription("Transfer");
  });
  await act(async () => editor().setDestinationId("savings"));
  await act(async () => editor().confirmTransferReview());
  expect(editor().canSubmit).toBe(true);
  await act(async () => changed === "source" ? editor().setProfileId("wallet") : editor().setDestinationId("loan"));
  expect(editor().transferReviewRequired).toBe(true);
  expect(editor().canSubmit).toBe(false);
  await act(async () => editor().submit());
  expect(api.save).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  await act(async () => editor().confirmTransferReview());
  await act(async () => editor().submit());
  expect(api.post).toHaveBeenCalledOnce();
  expect(api.post.mock.calls[0][0]).toMatchObject({ kind: "transfer", payload: {
    sourceFinancialAccountProfileId: changed === "source" ? "wallet" : "bank",
    destinationFinancialAccountProfileId: changed === "destination" ? "loan" : "savings",
    amount: { minorUnits: 1000 },
  } });
});
