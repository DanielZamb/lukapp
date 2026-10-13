import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const connection = api.authConnection.connection;

afterEach(() => vi.unstubAllEnvs());

test("an anonymous connection does not recognize an Owner", async () => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", "user_owner");
  expect(await convexTest(schema, modules).query(connection, {})).toEqual({
    status: "signed-out",
  });
});

test("the configured Clerk subject is recognized", async () => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", "user_owner");
  const t = convexTest(schema, modules).withIdentity({ subject: "user_owner" });
  expect(await t.query(connection, {})).toEqual({
    status: "owner",
    clerkSubject: "user_owner",
  });
});

test("a different signed-in subject is not recognized", async () => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", "user_owner");
  const t = convexTest(schema, modules).withIdentity({ subject: "user_other" });
  expect(await t.query(connection, {})).toEqual({ status: "not-owner" });
});

test("missing Owner configuration never recognizes a signed-in subject", async () => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", undefined);
  const t = convexTest(schema, modules).withIdentity({ subject: "user_owner" });
  expect(await t.query(connection, {})).toEqual({ status: "not-owner" });
});
