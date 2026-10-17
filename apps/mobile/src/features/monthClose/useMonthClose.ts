import { useLayoutEffect, useRef, useState } from "react";
import {
  lockFailureMessage,
  type ClosePeriod,
  type MonthCloseReadiness,
} from "./model";

export type MonthClosePhase =
  | { kind: "review" }
  | { kind: "confirm" }
  | { kind: "locking" }
  | { kind: "failed"; message: string }
  | { kind: "closed" };

export type MonthCloseTransport = {
  lock: (input: {
    workspaceId: string;
    period: ClosePeriod;
  }) => Promise<void>;
  reportFailure: (error: unknown) => boolean;
};

function openingPhase(readiness: MonthCloseReadiness | null): MonthClosePhase {
  return readiness?.alreadyLocked ? { kind: "closed" } : { kind: "review" };
}

export function useMonthClose(
  workspaceId: string,
  readiness: MonthCloseReadiness | null,
  transport: MonthCloseTransport,
) {
  const [phase, setPhase] = useState<MonthClosePhase>(() =>
    openingPhase(readiness),
  );
  const current = useRef(phase);
  const lifetime = useRef({ active: false });
  function change(next: MonthClosePhase) {
    current.current = next;
    setPhase(next);
  }
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    change(openingPhase(readiness));
    return () => {
      mounted.active = false;
    };
  }, [workspaceId, transport]);
  useLayoutEffect(() => {
    if (readiness?.alreadyLocked) change({ kind: "closed" });
    else if (
      readiness &&
      !readiness.canLock &&
      current.current.kind !== "locking" &&
      current.current.kind !== "closed"
    )
      change({ kind: "review" });
  }, [readiness?.alreadyLocked, readiness?.canLock]);

  async function confirm() {
    const mounted = lifetime.current;
    if (
      !mounted.active ||
      !readiness?.canLock ||
      (current.current.kind !== "confirm" && current.current.kind !== "failed")
    )
      return;
    change({ kind: "locking" });
    try {
      await transport.lock({ workspaceId, period: readiness.period });
      if (mounted.active) change({ kind: "closed" });
    } catch (error) {
      if (!mounted.active || transport.reportFailure(error)) return;
      change({ kind: "failed", message: lockFailureMessage(error) });
    }
  }

  return {
    phase,
    request: () => {
      if (
        lifetime.current.active &&
        readiness?.canLock &&
        current.current.kind === "review"
      )
        change({ kind: "confirm" });
    },
    cancel: () => {
      if (lifetime.current.active && current.current.kind === "confirm")
        change({ kind: "review" });
    },
    confirm,
  };
}
