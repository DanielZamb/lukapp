import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { calendarDate, nextWorkspaceMidnight } from "./timeZones";

export function useWorkspaceCalendar(timeZone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const tick = () => setNow(new Date());
    const arm = () => {
      const delay = Math.max(
        1,
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
