import { expect, test } from "vitest";
import { resolveEventCalendarDate } from "./eventCalendarDate";

const eventTime = Date.parse("2026-11-01T04:30:00Z");
const first = { changedAt: eventTime + 1000, previousValue: "America/Bogota" };
const second = { changedAt: eventTime + 3000, previousValue: "Pacific/Auckland" };

test("an event before any changes uses the workspace zone", () => {
  expect(resolveEventCalendarDate({ eventTime, currentTimeZone: "America/Bogota", changes: [] })).toBe("2026-10-31");
});

test("the first later receipt supplies the historical zone regardless of input order", () => {
  expect(resolveEventCalendarDate({ eventTime, currentTimeZone: "America/Los_Angeles", changes: [second, first] })).toBe("2026-10-31");
  expect(resolveEventCalendarDate({ eventTime: eventTime + 2000, currentTimeZone: "America/Los_Angeles", changes: [second, first] })).toBe("2026-11-01");
});

test("events at and after a change use the zone then in force", () => {
  expect(resolveEventCalendarDate({ eventTime: first.changedAt, currentTimeZone: "America/Los_Angeles", changes: [first, second] })).toBe("2026-11-01");
  expect(resolveEventCalendarDate({ eventTime: second.changedAt, currentTimeZone: "America/Los_Angeles", changes: [first, second] })).toBe("2026-10-31");
  expect(resolveEventCalendarDate({ eventTime: eventTime + 4000, currentTimeZone: "America/Los_Angeles", changes: [first, second] })).toBe("2026-10-31");
});
