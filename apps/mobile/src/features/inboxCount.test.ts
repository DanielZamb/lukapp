import { expect, test } from "vitest";
import { inboxBadgeCount } from "./inboxCount";

test("Home shows the Drafts badge only when both counts are known", () => {
  expect(inboxBadgeCount(null, null)).toBeUndefined();
  expect(inboxBadgeCount(2, null)).toBeUndefined();
  expect(inboxBadgeCount(null, 1)).toBeUndefined();
  expect(inboxBadgeCount(2, 1)).toBe(3);
  expect(inboxBadgeCount(0, 0)).toBe(0);
});
