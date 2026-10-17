import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { calendarDate, nextWorkspaceMidnight } from "./timeZones";

export function useWorkspaceCalendar(timeZone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const tick = () => setNow(new Date());
    const arm = () => {
      // nextWorkspaceMidnight is always in the future; the floor only guards a clock jump.
      const delay = Math.max(
        1_000,
        nextWorkspaceMidnight(new Date(), timeZone) - Date.now(),
      );
      timeout = setTimeout(() => {
        tick();
        arm();
      }, delay);
    };
    arm();
    const changes = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      if (timeout) clearTimeout(timeout);
      changes.remove();
    };
  }, [timeZone]);
  const date = calendarDate(now, timeZone);
  return { date, month: date.slice(0, 7), now };
}
