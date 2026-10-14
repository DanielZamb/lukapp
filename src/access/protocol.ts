export const accessPolicy = {
  version: "lukapp-device-access@1",
  challengeLifetimeMs: 60_000,
  inactivityLifetimeMs: 30 * 24 * 60 * 60 * 1000,
  maximumLifetimeMs: 90 * 24 * 60 * 60 * 1000,
  localInputLifetimeMs: 15 * 24 * 60 * 60 * 1000,
  ordinaryLockMs: 2 * 60 * 1000,
  monthCloseLockMs: 10 * 60 * 1000,
} as const;

export const operations = [
  "budget.createBudget", "budget.updateBudget", "budget.retireBudget",
  "budget.listBudgets", "budget.evaluateBudgets", "budget.budgetImpactWarning",
  "accounting.createUserCategory", "accounting.suggestCategoryNature", "accounting.listUserCategories", "accounting.categoryTotals",
  "accounting.changeUserCategory", "accounting.previewCategoryReclassification", "accounting.confirmCategoryReclassification",
  "devices.register", "devices.revoke", "devices.heartbeat", "devices.approveRegistration",
  "accounting.createPersonalWorkspace", "accounting.personalWorkspace", "accounting.openWorkspace",
  "accounting.createHouseholdWorkspace", "accounting.listOwnedWorkspaces",
  "accounting.localInputAuthority", "accounting.setupFinancialAccount",
  "accounting.recordOpeningPosition", "accounting.recordAccountTransfer",
  "accounting.createFinancialAccountProfile", "accounting.listFinancialAccountProfiles",
  "accounting.listLedgerAccounts", "accounting.listCatalogAccounts", "accounting.lockAccountingPeriod",
  "accounting.recordCashExpense", "accounting.recordCashIncome", "accounting.reversePostedEntry",
  "accounting.listPostedExpenses",
  "savingsRecovery.saveDraft", "savingsRecovery.activatePlan", "savingsRecovery.cancelPlan",
  "savingsRecovery.replacePlan", "savingsRecovery.reconcilePlans", "savingsRecovery.decideCandidate",
  "savingsRecovery.recordContribution", "savingsRecovery.reverseContribution",
  "savingsRecovery.proposeAllocation", "savingsRecovery.decideProposal", "savingsRecovery.declareOpeningProgress",
  "savingsRecovery.listCandidates", "savingsRecovery.progress", "savingsRecovery.monthlyWaterfall",
  "accounting.listJournalEntries", "accounting.balances", "accounting.trialBalance",
] as const;
export type AccessOperation = typeof operations[number];
export type FinancialOperation = Exclude<AccessOperation, `devices.${string}`>;
export type DeviceProof = { challengeId: string; signature: string };
export type DevicePlatform = "ios" | "android";
export const accessDenials = [
  "session_id_required", "session_id_invalid", "session_state_unverified", "session_not_active", "session_revoked",
  "device_unregistered", "device_unknown", "device_revoked", "session_device_mismatch",
  "session_inactive", "session_maximum_lifetime", "recovery_registration_blocked",
  "device_proof_required", "device_proof_invalid", "device_challenge_expired",
  "device_challenge_replayed", "device_request_mismatch", "device_slot_occupied",
  "device_registration_conflict", "device_key_invalid",
] as const;
export type AccessDenial = typeof accessDenials[number];

export type ContactDirective = "register-device" | "wipe-local-input-and-sign-out" | "unlock-online";
const directives = {
  session_id_required: "wipe-local-input-and-sign-out",
  session_id_invalid: "wipe-local-input-and-sign-out",
  session_state_unverified: "wipe-local-input-and-sign-out",
  session_not_active: "wipe-local-input-and-sign-out",
  session_revoked: "wipe-local-input-and-sign-out",
  device_unregistered: "register-device",
  device_unknown: "register-device",
  device_revoked: "wipe-local-input-and-sign-out",
  session_device_mismatch: "unlock-online",
  session_inactive: "wipe-local-input-and-sign-out",
  session_maximum_lifetime: "wipe-local-input-and-sign-out",
  recovery_registration_blocked: "wipe-local-input-and-sign-out",
  device_proof_required: "unlock-online",
  device_proof_invalid: "unlock-online",
  device_challenge_expired: "unlock-online",
  device_challenge_replayed: "unlock-online",
  device_request_mismatch: "unlock-online",
  device_slot_occupied: "unlock-online",
  device_registration_conflict: "unlock-online",
  device_key_invalid: "unlock-online",
} satisfies Record<AccessDenial, ContactDirective>;
export function directiveFor(code: AccessDenial): ContactDirective {
  return directives[code];
}

export function bindingExpiry(binding: { createdAt: number; lastSeenAt: number }, now: number): AccessDenial | null {
  if (now >= binding.createdAt + accessPolicy.maximumLifetimeMs) return "session_maximum_lifetime";
  if (now >= binding.lastSeenAt + accessPolicy.inactivityLifetimeMs) return "session_inactive";
  return null;
}

export function lockRequired(facts: {
  coldLaunch: boolean;
  foregroundIdleMs: number;
  backgroundMs: number;
  screen: "ordinary" | "month-close" | "security";
}) {
  return facts.coldLaunch || facts.screen === "security" || facts.backgroundMs >= accessPolicy.ordinaryLockMs ||
    facts.foregroundIdleMs >= (facts.screen === "month-close" ? accessPolicy.monthCloseLockMs : accessPolicy.ordinaryLockMs);
}

export interface NativeDeviceKey {
  publicKey(): Promise<string>;
  sign(message: string): Promise<string>;
  delete(): Promise<void>;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return '["null"]';
  if (typeof value === "string") return JSON.stringify(["string", value]);
  if (typeof value === "boolean") return JSON.stringify(["boolean", value]);
  if (typeof value === "number") return JSON.stringify(["number", Object.is(value, -0) ? "-0" : String(value)]);
  if (Array.isArray(value)) return `["array",[${value.map(canonicalJson).join(",")}]]`;
  if (typeof value === "object" && value !== null) {
    const pairs = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `["object",[${pairs.map(([key, v]) => `[${JSON.stringify(key)},${canonicalJson(v)}]`).join(",")}]]`;
  }
  throw new Error("Request is not a supported Convex argument");
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error("Invalid lowercase hex");
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}
export async function requestHash(args: unknown): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(args)))));
}
export function challengeMessage(facts: {
  challengeId: string; nonce: string; tokenIdentifier: string; sid: string;
  operation: AccessOperation; payloadHash: string; expiresAt: number;
}) {
  return canonicalJson({ protocol: accessPolicy.version, ...facts });
}

export function derSignatureToP1363(derHex: string): string {
  const der = hexToBytes(derHex);
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2) throw new Error("Invalid P-256 DER signature");
  let offset = 2;
  function integer(): Uint8Array<ArrayBuffer> {
    if (der[offset++] !== 0x02) throw new Error("Invalid DER integer");
    const length = der[offset++];
    if (length === undefined || length < 1 || length > 33 || offset + length > der.length) throw new Error("Invalid P-256 integer size");
    const bytes = der.slice(offset, offset + length);
    offset += length;
    const first = bytes[0];
    if (first === undefined || first >= 0x80 || (bytes.length > 1 && first === 0 && (bytes[1] ?? 0) < 0x80)) throw new Error("Non-canonical DER integer");
    const magnitude = first === 0 ? bytes.slice(1) : bytes;
    if (magnitude.length > 32) throw new Error("Oversized P-256 integer");
    const padded = new Uint8Array(32);
    padded.set(magnitude, 32 - magnitude.length);
    return padded;
  }
  const r = integer();
  const s = integer();
  if (offset !== der.length) throw new Error("Trailing DER data");
  return bytesToHex(r) + bytesToHex(s);
}
