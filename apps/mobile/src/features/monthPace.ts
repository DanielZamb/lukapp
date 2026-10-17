export function calendarMonthShape(calendarDate: string): {
  day: number;
  daysInMonth: number;
} {
  const [year, month, day] = calendarDate.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { day, daysInMonth };
}

export function monthPaceProgress(day: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 0;
  return day / daysInMonth;
}

export function projectedMonthSpendMinorUnits(
  monthSpendMinorUnits: number,
  day: number,
  daysInMonth: number,
): number {
  if (day <= 0 || daysInMonth <= 0) return 0;
  return Math.round((monthSpendMinorUnits / day) * daysInMonth);
}
