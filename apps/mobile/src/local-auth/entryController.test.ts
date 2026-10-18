import { expect, test, vi } from "vitest";
import { EntryController, type EntryDependencies } from "./entryController";
import { parseInstallMarker, type InstallMarker } from "./installMarker";
import { runLocalInputWrite } from "./localInput";

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
    clearInput: vi.fn(async (_subject: string) => {}),
    clearEnrollment: vi.fn(async (_marker: InstallMarker) => {}),
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

test.each(["unlock", "enrollment"])("background during the %s prompt cancels it and late success cannot reopen the app", async operation => {
  const { gate, deps } = fixture(operation === "unlock" ? enrolled : {
    version: 1, installId, kind: "sign-in-required",
  });
  if (operation === "enrollment") gate.approveSignIn(identity.sessionId);
  await gate.setIdentity(identity);
  const started = deferred();
  const finish = deferred();
  const prompt = operation === "unlock" ? deps.unlock : deps.enroll;
  prompt.mockImplementation(async () => { started.resolve(); await finish.promise; });
  const attempt = gate.unlock();
  await started.promise;
  expect(gate.getSnapshot().state.kind).toBe("authenticating");
  // OS prompt focus loss is not app backgrounding.
  gate.setPresence(false, false, false);
  expect(deps.cancelPrompt).not.toHaveBeenCalled();
  gate.setPresence(false, false, true);
  expect(deps.cancelPrompt).toHaveBeenCalledOnce();
  expect(gate.getSnapshot().obscured).toBe(true);
  finish.resolve();
  await attempt;
  await new Promise<void>(resolve => setImmediate(resolve));
  gate.setPresence(true, true, false);
  expect(gate.isOpenFor(identity)).toBe(false);
  expect(gate.getSnapshot().state.kind).toBe("reauthentication");
  expect(prompt).toHaveBeenCalledOnce();
  expect(deps.reveal).not.toHaveBeenCalled();
});

test("Sign in instead from the locked screen requires a new Clerk sign-in without starting biometrics", async () => {
  const { gate, deps, stored } = fixture();
  await gate.setIdentity(identity);
  await gate.reauthenticate();
  expect(stored()).toEqual({ version: 1, installId, kind: "sign-in-required" });
  expect(deps.signOut).toHaveBeenCalledOnce();
  expect(deps.unlock).not.toHaveBeenCalled();
  expect(deps.enroll).not.toHaveBeenCalled();
  expect(gate.isOpenFor(identity)).toBe(false);
  await gate.setIdentity(null);
  expect(gate.getSnapshot().state.kind).toBe("sign-in");
});

test("failed Clerk sign-out from the locked screen retains the reauthentication path", async () => {
  const { gate, deps } = fixture();
  await gate.setIdentity(identity);
  deps.signOut.mockRejectedValueOnce(new Error("Offline"));
  await gate.reauthenticate();
  expect(gate.getSnapshot().state.kind).toBe("reauthentication");
  await gate.reauthenticate();
  expect(deps.signOut).toHaveBeenCalledTimes(2);
  expect(deps.unlock).not.toHaveBeenCalled();
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

test("the stable install ID is available only after unlock and disappears when locked", async () => {
  const { gate, time } = fixture();
  await gate.setIdentity(identity);
  expect(gate.unlockedInstallId()).toBeNull();
  await gate.unlock();
  expect(gate.unlockedInstallId()).toBe(installId);
  time(121_000);
  gate.tick();
  expect(gate.unlockedInstallId()).toBeNull();
});

test("confirmed loss closes before await, drains in-flight saves, and fences old saves and clears", async () => {
  const { gate, deps, stored } = await opened();
  const lease = gate.unlockedInputLease();
  if (!lease) throw new Error("Missing admitted lease");
  let pending = "old entry";
  let finishSave = () => {};
  const save = runLocalInputWrite(lease, () => new Promise<void>((resolve) => {
    finishSave = () => { pending = "late old save"; resolve(); };
  }));
  await Promise.resolve();
  deps.clearInput.mockImplementation(async () => { pending = ""; });
  const cleanup = gate.denyAccessFor(lease);
  expect(gate.getSnapshot()).toEqual({ state: { kind: "revocation", cleanup: "running" }, obscured: true });
  expect(gate.isOpenFor(identity)).toBe(false);
  expect(deps.clearInput).not.toHaveBeenCalled();
  const lateSave = runLocalInputWrite(lease, async () => { pending = "recreated"; });
  const rejectedSave = expect(lateSave).rejects.toThrow("admission ended");
  finishSave();
  await Promise.all([save, cleanup, rejectedSave]);
  expect(pending).toBe("");
  expect(deps.clearEnrollment).toHaveBeenCalledOnce();
  expect(deps.signOut).toHaveBeenCalledOnce();
  expect(stored().kind).toBe("sign-in-required");
  await gate.setIdentity(null);
  gate.approveSignIn("new-session");
  await gate.setIdentity({ subject: "owner", sessionId: "new-session" });
  await gate.unlock();
  const nextLease = gate.unlockedInputLease();
  if (!nextLease) throw new Error("Missing new lease");
  await runLocalInputWrite(nextLease, async () => { pending = "new entry"; });
  await expect(runLocalInputWrite(lease, async () => { pending = ""; })).rejects.toThrow("admission ended");
  expect(pending).toBe("new entry");
  const cleanups = deps.clearInput.mock.calls.length;
  await gate.denyAccessFor(lease);
  expect(gate.isOpenFor({ subject: "owner", sessionId: "new-session" })).toBe(true);
  expect(deps.clearInput).toHaveBeenCalledTimes(cleanups);
});

test("failed deletion keeps a durable denial, cannot unlock, and resumes cleanup on restart", async () => {
  const { gate, deps, stored } = await opened();
  deps.clearInput.mockRejectedValueOnce(new Error("Storage unavailable"));
  await gate.denyAccess();
  expect(gate.getSnapshot()).toEqual({ state: { kind: "revocation", cleanup: "failed" }, obscured: true });
  expect(stored()).toEqual({ ...enrolled, kind: "wipe-required" });
  expect(deps.signOut).not.toHaveBeenCalled();
  await gate.unlock();
  expect(gate.isOpenFor(identity)).toBe(false);
  const restart = new EntryController(deps);
  await restart.setIdentity(identity);
  expect(deps.clearInput).toHaveBeenCalledTimes(2);
  expect(deps.signOut).toHaveBeenCalledOnce();
  expect(stored().kind).toBe("sign-in-required");
  expect(restart.isOpenFor(identity)).toBe(false);
});

test("cleanup retries storage and SDK sign-out failures without allowing a new enrollment", async () => {
  const { gate, deps } = await opened();
  deps.signOut.mockRejectedValueOnce(new Error("Offline"));
  await gate.denyAccess();
  expect(gate.getSnapshot().state).toEqual({ kind: "revocation", cleanup: "failed" });
  gate.approveSignIn("other");
  await gate.unlock();
  expect(deps.enroll).not.toHaveBeenCalled();
  await gate.retryCleanup();
  expect(deps.signOut).toHaveBeenCalledTimes(2);
  expect(gate.getSnapshot().state.kind).toBe("reauthentication");
});

test("Clerk authentication loss also clears local input before the sign-in screen", async () => {
  const { gate, deps } = await opened();
  await gate.setIdentity(null);
  expect(deps.clearInput).toHaveBeenCalledExactlyOnceWith("owner");
  expect(deps.clearEnrollment).toHaveBeenCalledOnce();
  expect(gate.getSnapshot().state.kind).toBe("sign-in");
});

test("fresh enrollment clears owner input surviving reinstall even when no Clerk session survived", async () => {
  const { gate, deps } = fixture({ version: 1, installId, kind: "sign-in-required" });
  await gate.setIdentity(null);
  gate.approveSignIn("new-session");
  await gate.setIdentity({ subject: "owner", sessionId: "new-session" });
  deps.clearInput.mockRejectedValueOnce(new Error("Storage failed"));
  await gate.unlock();
  expect(gate.isOpenFor({ subject: "owner", sessionId: "new-session" })).toBe(false);
  expect(deps.enroll).not.toHaveBeenCalled();
  expect(deps.clearInput).toHaveBeenCalledExactlyOnceWith("owner");
});

for (const loaded of [null, { subject: "other", sessionId: "other-session" }, { subject: "owner", sessionId: "replacement-session" }]) {
  test(`cold enrolled marker cleans its durable owner when Clerk loads ${JSON.stringify(loaded)}`, async () => {
    const { gate, deps, stored } = fixture();
    let input = "owner's pending expense";
    let sentinel = "owner's enrollment";
    deps.clearInput.mockImplementation(async subject => { if (subject === "owner") input = ""; });
    deps.clearEnrollment.mockImplementation(async () => { sentinel = ""; });
    await gate.setIdentity(loaded);
    expect({ input, sentinel, marker: stored().kind, state: gate.getSnapshot().state.kind }).toEqual({
      input: "", sentinel: "", marker: "sign-in-required", state: loaded ? "reauthentication" : "sign-in",
    });
    expect(deps.clearInput).toHaveBeenCalledExactlyOnceWith("owner");
    expect(deps.signOut).toHaveBeenCalledOnce();
    expect(gate.isOpenFor(loaded)).toBe(false);
  });
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

for (const stage of ["sentinel", "marker"]) {
  test.each([false, true])(`identity loss drains the pending enrollment ${stage} write before cleanup, deletion fails: %s`, async deletionFails => {
    const { gate, deps, stored } = fixture({ version: 1, installId, kind: "sign-in-required" });
    const started = deferred();
    const finish = deferred();
    let sentinel = "";
    deps.enroll.mockImplementation(async () => {
      if (stage === "sentinel") { started.resolve(); await finish.promise; }
      sentinel = "late enrollment";
    });
    const writeMarker = deps.writeMarker.getMockImplementation();
    if (!writeMarker) throw new Error("Missing marker store");
    deps.writeMarker.mockImplementation(async marker => {
      if (stage === "marker" && marker.kind === "enrolled") { started.resolve(); await finish.promise; }
      await writeMarker(marker);
    });
    deps.clearEnrollment.mockImplementation(async () => { sentinel = ""; });
    if (deletionFails) deps.clearEnrollment.mockRejectedValueOnce(new Error("Deletion failed"));
    await gate.setIdentity(null);
    gate.approveSignIn(identity.sessionId);
    await gate.setIdentity(identity);
    const enrollment = gate.unlock();
    await started.promise;
    const cleanup = gate.setIdentity(null);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(gate.getSnapshot().obscured).toBe(true);
    finish.resolve();
    await Promise.all([enrollment, cleanup]);
    if (deletionFails) {
      expect({ sentinel, marker: stored().kind, state: gate.getSnapshot() }).toEqual({
        sentinel: "late enrollment", marker: "wipe-required",
        state: { state: { kind: "revocation", cleanup: "failed" }, obscured: true },
      });
      expect(deps.signOut).not.toHaveBeenCalled();
      gate.approveSignIn("replacement");
      await gate.unlock();
      expect(gate.isOpenFor(identity)).toBe(false);
      const restart = new EntryController(deps);
      await restart.setIdentity(null);
      expect(restart.getSnapshot().state.kind).toBe("sign-in");
      expect({ sentinel, marker: stored().kind }).toEqual({ sentinel: "", marker: "sign-in-required" });
      return;
    }
    expect({ sentinel, marker: stored().kind, state: gate.getSnapshot().state.kind }).toEqual({
      sentinel: "", marker: "sign-in-required", state: "sign-in",
    });
    expect(deps.signOut).toHaveBeenCalledOnce();
  });
}
