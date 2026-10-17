import { expect, test, vi } from "vitest";
import { EntryController, type EntryDependencies } from "./entryController";
import { parseInstallMarker, type InstallMarker } from "./installMarker";

const installId = "497af871-e049-4102-b496-4cd529cf60b6";
const identity = { subject: "owner", sessionId: "session-one" };
const enrolled: InstallMarker = {
  version: 1,
  installId,
  kind: "enrolled",
  ...identity,
};
function fixture(marker: InstallMarker = enrolled) {
  let now = 1_000;
  let stored = marker;
  const deps = {
    now: () => now,
    readMarker: vi.fn(async () => stored),
    writeMarker: vi.fn(async (value: InstallMarker) => {
      stored = value;
    }),
    unlock: vi.fn(async () => {}),
    enroll: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    initializePrivacy: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
    reveal: vi.fn(async () => {}),
    cancelPrompt: vi.fn(async () => {}),
  } satisfies EntryDependencies;
  const gate = new EntryController(deps);
  return {
    gate,
    deps,
    time: (value: number) => {
      now = value;
    },
    stored: () => stored,
  };
}
async function opened() {
  const f = fixture();
  await f.gate.setIdentity(identity);
  await f.gate.unlock();
  return f;
}

test("cold entry never reuses a previous unlock; strong sentinel check precedes entry", async () => {
  const { gate, deps } = fixture();
  await gate.setIdentity(identity);
  expect(gate.getSnapshot()).toEqual({
    state: { kind: "locked" },
    obscured: true,
  });
  expect(gate.isOpenFor(identity)).toBe(false);
  await gate.unlock();
  expect(deps.unlock).toHaveBeenCalledExactlyOnceWith(enrolled, "owner");
  expect(gate.getSnapshot()).toEqual({
    state: { kind: "open" },
    obscured: false,
  });
  const nextLaunch = new EntryController(deps);
  await nextLaunch.setIdentity(identity);
  expect(nextLaunch.getSnapshot().state.kind).toBe("locked");
});

test("normal foreground interaction resets the two-minute deadline but a late touch cannot unlock", async () => {
  const { gate, time } = await opened();
  time(120_000);
  gate.interaction();
  time(239_999);
  gate.tick();
  expect(gate.getSnapshot().state.kind).toBe("open");
  time(240_000);
  gate.interaction();
  expect(gate.getSnapshot().state.kind).toBe("locked");
});

test("active Month Close gets ten foreground minutes; its background cap is still two", async () => {
  const { gate, time } = await opened();
  gate.setPath("/month-close");
  time(600_999);
  gate.tick();
  expect(gate.getSnapshot().state.kind).toBe("open");
  time(601_000);
  gate.tick();
  expect(gate.getSnapshot().state.kind).toBe("locked");
  await gate.unlock();
  gate.setPresence(false, false, true);
  time(721_000);
  gate.setPresence(true, true, false);
  expect(gate.getSnapshot().state.kind).toBe("locked");
});

test("short background hides content immediately and resumes without consuming foreground idle time", async () => {
  const { gate, time, deps } = await opened();
  time(100_000);
  gate.setPresence(false, false, true);
  expect(gate.getSnapshot()).toEqual({
    state: { kind: "open" },
    obscured: true,
  });
  time(110_000);
  gate.setPresence(true, true, false);
  expect(gate.getSnapshot()).toEqual({
    state: { kind: "open" },
    obscured: false,
  });
  time(130_999);
  gate.tick();
  expect(gate.getSnapshot().state.kind).toBe("open");
  time(131_000);
  gate.tick();
  expect(gate.getSnapshot().state.kind).toBe("locked");
  expect(deps.unlock).toHaveBeenCalledOnce();
});

test("two minutes in the background or notification shade requires re-entry", async () => {
  for (const background of [true, false]) {
    const { gate, time } = await opened();
    gate.setPresence(!background, false, background);
    time(121_000);
    gate.setPresence(true, true, false);
    expect(gate.getSnapshot().state.kind).toBe("locked");
  }
});

test("security routes hide before effects and require fresh biometrics, never the prior app unlock", async () => {
  const { gate, deps } = await opened();
  expect(gate.needsPathUnlock("/settings")).toBe(true);
  gate.setPath("/settings");
  expect(gate.isOpenFor(identity)).toBe(false);
  await gate.unlock();
  expect(gate.isOpenFor(identity)).toBe(true);
  expect(deps.unlock).toHaveBeenCalledTimes(2);
});

test("cancellation, lockout or invalidated enrollment require Clerk sign-in and sentinel reprovision", async () => {
  for (const failure of ["cancelled", "lockout", "sentinel-invalidated"]) {
    const { gate, deps, stored } = fixture();
    deps.unlock.mockRejectedValueOnce(new Error(failure));
    await gate.setIdentity(identity);
    await gate.unlock();
    expect(gate.getSnapshot().state.kind).toBe("reauthentication");
    expect(stored()).toEqual({
      version: 1,
      installId,
      kind: "sign-in-required",
    });
    await gate.unlock();
    expect(deps.unlock).toHaveBeenCalledOnce();
    await gate.reauthenticate();
    expect(deps.signOut).toHaveBeenCalledOnce();
    await gate.setIdentity(null);
    expect(gate.getSnapshot().state.kind).toBe("sign-in");
    gate.approveSignIn("new-session");
    await gate.setIdentity({ subject: "owner", sessionId: "new-session" });
    await gate.unlock();
    expect(deps.enroll).toHaveBeenCalledExactlyOnceWith(
      { version: 1, installId, kind: "sign-in-required" },
      "owner",
    );
    expect(gate.getSnapshot().state.kind).toBe("open");
    expect(stored()).toEqual({
      version: 1,
      installId,
      kind: "enrolled",
      subject: "owner",
      sessionId: "new-session",
    });
  }
});

test("a fresh install cannot trust Clerk state surviving in the iOS Keychain", async () => {
  const { gate, deps } = fixture({
    version: 1,
    installId,
    kind: "sign-in-required",
  });
  await gate.setIdentity(identity);
  expect(deps.signOut).toHaveBeenCalledOnce();
  expect(deps.enroll).not.toHaveBeenCalled();
  expect(gate.isOpenFor(identity)).toBe(false);
  await gate.setIdentity(null);
  expect(gate.getSnapshot().state.kind).toBe("sign-in");
  gate.approveSignIn("new-session");
  await gate.setIdentity({ subject: "owner", sessionId: "new-session" });
  await gate.unlock();
  expect(gate.isOpenFor({ subject: "owner", sessionId: "new-session" })).toBe(
    true,
  );
});

test("a new session without the completed Clerk flow cannot silently reprovision enrollment", async () => {
  const { gate, deps } = fixture();
  await gate.setIdentity({ subject: "owner", sessionId: "unapproved" });
  expect(deps.signOut).toHaveBeenCalledOnce();
  expect(deps.enroll).not.toHaveBeenCalled();
  expect(gate.isOpenFor(identity)).toBe(false);
});

test("no enrolled strong biometry keeps the gate closed even after fresh Clerk sign-in", async () => {
  const { gate, deps } = fixture();
  await gate.setIdentity(null);
  deps.enroll.mockRejectedValueOnce(new Error("Strong biometry unavailable"));
  gate.approveSignIn("new-session");
  await gate.setIdentity({ subject: "owner", sessionId: "new-session" });
  await gate.unlock();
  expect(gate.getSnapshot().state.kind).toBe("reauthentication");
  expect(gate.isOpenFor(identity)).toBe(false);
});

test("an unlock completing after backgrounding or sign-out cannot reopen the app", async () => {
  for (const interruption of ["background", "sign-out"] as const) {
    const { gate, deps } = fixture();
    let finish = () => {};
    deps.unlock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await gate.setIdentity(identity);
    const attempt = gate.unlock();
    if (interruption === "background") gate.setPresence(false, false, true);
    else await gate.setIdentity(null);
    finish();
    await attempt;
    expect(gate.isOpenFor(identity)).toBe(false);
  }
});

test("inactivity clock rollback fails closed and identity changes never reuse an unlock", async () => {
  const { gate, time } = await opened();
  time(0);
  gate.tick();
  expect(gate.getSnapshot().state.kind).toBe("locked");
  const next = await opened();
  expect(
    next.gate.isOpenFor({ subject: "other", sessionId: identity.sessionId }),
  ).toBe(false);
});

test("privacy or marker failure never opens financial UI", async () => {
  for (const operation of ["initializePrivacy", "readMarker"] as const) {
    const { gate, deps } = fixture();
    deps[operation].mockRejectedValueOnce(new Error("Unavailable"));
    await gate.setIdentity(identity);
    expect(gate.getSnapshot().state.kind).toBe("unavailable");
    expect(gate.isOpenFor(identity)).toBe(false);
  }
});

test("install-marker schema treats missing, corrupt and foreign-version data as a fresh install", () => {
  for (const raw of [
    null,
    "bad json",
    "{}",
    JSON.stringify({ ...enrolled, version: 2 }),
    JSON.stringify({ ...enrolled, installId: "not-a-uuid" }),
  ])
    expect(parseInstallMarker(raw)).toBeNull();
  expect(parseInstallMarker(JSON.stringify(enrolled))).toEqual(enrolled);
});
