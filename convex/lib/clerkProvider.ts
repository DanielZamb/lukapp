import { ConvexError } from "convex/values";
import { z } from "zod";

const clerkSession = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  client_id: z.string().min(1),
  status: z.string(),
  expire_at: z.number().int().positive(),
  abandon_at: z.number().int().positive(),
  created_at: z.number().int().nonnegative(),
});
export type ClerkSession = z.infer<typeof clerkSession>;

async function request(path: string, method: "GET" | "POST") {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new ConvexError({ code: "provider_unavailable" });
  try {
    return await fetch(`https://api.clerk.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
  } catch {
    throw new ConvexError({ code: "provider_unavailable" });
  }
}

async function parse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) throw new ConvexError({ code: "provider_unavailable" });
  try {
    return schema.parse(await response.json());
  } catch {
    throw new ConvexError({ code: "provider_unavailable" });
  }
}

export async function getClerkSession(sid: string): Promise<ClerkSession | null> {
  const response = await request(`/sessions/${encodeURIComponent(sid)}`, "GET");
  if (response.status === 404) return null;
  return parse(response, clerkSession);
}

const terminalStatuses = new Set(["revoked", "ended", "expired", "abandoned", "removed"]);
export function isTerminalClerkSession(session: ClerkSession | null, now = Date.now()) {
  if (!session) return true;
  return terminalStatuses.has(session.status) || session.expire_at <= now || session.abandon_at <= now;
}

export async function listActiveClerkSessions(userId: string) {
  const sessions: ClerkSession[] = [];
  const pageSchema = z.object({
    data: z.array(clerkSession),
    total_count: z.number().int().nonnegative(),
  });
  for (let offset = 0; offset < 5000; offset += 100) {
    const params = new URLSearchParams({
      user_id: userId, status: "active", limit: "100", offset: String(offset), paginated: "true",
    });
    const page = await parse(await request(`/sessions?${params}`, "GET"), pageSchema);
    if (page.data.some((s) => s.user_id !== userId))
      throw new ConvexError({ code: "provider_unavailable" });
    sessions.push(...page.data);
    if (sessions.length >= page.total_count) return sessions;
    if (page.data.length === 0) break;
  }
  throw new ConvexError({ code: "provider_unavailable" });
}

export async function revokeClerkSession(sid: string, userId: string) {
  const session = await getClerkSession(sid);
  if (!session) return;
  if (session.id !== sid || session.user_id !== userId)
    throw new ConvexError({ code: "session_owner_mismatch" });
  if (["revoked", "ended", "expired", "abandoned", "removed"].includes(session.status)) return;
  const response = await request(`/sessions/${encodeURIComponent(sid)}/revoke`, "POST");
  if (response.status === 404) return;
  const revoked = await parse(response, clerkSession);
  if (revoked.id !== sid || revoked.user_id !== userId || revoked.status !== "revoked")
    throw new ConvexError({ code: "provider_unavailable" });
}
