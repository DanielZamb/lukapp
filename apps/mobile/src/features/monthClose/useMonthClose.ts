import { useLayoutEffect, useRef, useState } from "react";
import {
  lockFailureMessage,
  type ClosePeriod,
  type MonthCloseReadiness,
} from "./model";

export type MonthClosePhase =
  | { kind: "review" }
  | { kind: "confirm"; period: ClosePeriod }
  | { kind: "locking"; period: ClosePeriod }
  | { kind: "failed"; period: ClosePeriod; message: string }
  | { kind: "closed"; period: ClosePeriod };

export type MonthCloseTransport = {
  // Counts Drafts dated in the period and locks only when there are none, holding the local
  // input lease across both so no Draft can be written between the count and the lock.
  // Returns the Draft count it found; 0 means the period was locked.
  lockWhenClear: (input: { workspaceId: string; period: ClosePeriod }) => Promise<number>;
  reportFailure: (error: unknown) => boolean;
};

function samePeriod(left: ClosePeriod, right: ClosePeriod) {
  return left.year === right.year && left.month === right.month;
}

function openingPhase(readiness: MonthCloseReadiness | null): MonthClosePhase {
  return readiness?.alreadyLocked
    ? { kind: "closed", period: readiness.period }
    : { kind: "review" };
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
    const now = current.current;
    if (now.kind === "review") {
      if (readiness?.alreadyLocked)
        change({ kind: "closed", period: readiness.period });
      return;
    }
    if (
      readiness &&
      samePeriod(readiness.period, now.period) &&
      !readiness.canLock &&
      (now.kind === "confirm" || (now.kind === "failed" && readiness.alreadyLocked))
    )
      change(
        readiness.alreadyLocked
          ? { kind: "closed", period: now.period }
          : { kind: "review" },
      );
  }, [readiness?.alreadyLocked, readiness?.canLock, readiness?.period]);

  async function confirm() {
    const mounted = lifetime.current;
    const now = current.current;
    if (
      !mounted.active ||
      (now.kind !== "confirm" && now.kind !== "failed")
    )
      return;
    const period = now.period;
    change({ kind: "locking", period });
    try {
      const drafts = await transport.lockWhenClear({ workspaceId, period });
      if (!mounted.active) return;
      change(drafts > 0 ? { kind: "review" } : { kind: "closed", period });
    } catch (error) {
      if (!mounted.active || transport.reportFailure(error)) return;
      change({ kind: "failed", period, message: lockFailureMessage(error) });
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
        change({ kind: "confirm", period: readiness.period });
    },
    cancel: () => {
      if (lifetime.current.active && current.current.kind === "confirm")
        change({ kind: "review" });
    },
    confirm,
  };
}
