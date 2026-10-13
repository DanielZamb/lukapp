import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { proveDeviceRequest } from "./client";
import type { DeviceChallengeTransport, DeviceStatus, NativeRequestHash } from "./client";
import { accessDenials, directiveFor } from "./protocol";
import type { ContactDirective, NativeDeviceKey } from "./protocol";

export interface ForegroundAdmissionTransport extends DeviceChallengeTransport {
  status(args: FunctionArgs<typeof api.devices.status>): Promise<DeviceStatus>;
  heartbeat(args: FunctionArgs<typeof api.devices.heartbeat>): Promise<FunctionReturnType<typeof api.devices.heartbeat>>;
  localInputAuthority(args: FunctionArgs<typeof api.accounting.localInputAuthority>): Promise<FunctionReturnType<typeof api.accounting.localInputAuthority>>;
}

export type ForegroundAdmission =
  | { kind: "ready"; localInput: "allowed"; workspaceId: string; deviceId: Id<"mobileDevices"> }
  | { kind: "provisioning-required"; localInput: "blocked"; deviceId: Id<"mobileDevices"> }
  | { kind: "wipe-required"; localInput: "blocked"; code: string; directive: "wipe-local-input-and-sign-out" }
  | { kind: "blocked"; localInput: "blocked"; code: string; directive: Exclude<ContactDirective, "wipe-local-input-and-sign-out"> | "block-action" };

export type AdmissionDenial = Extract<ForegroundAdmission, { code: string }>;

function denied(code: string, directive: ContactDirective | "block-action"): AdmissionDenial {
  if (directive === "wipe-local-input-and-sign-out") {
    return { kind: "wipe-required", localInput: "blocked", code, directive };
  }
  return { kind: "blocked", localInput: "blocked", code, directive };
}

export function admissionFailure(error: unknown): AdmissionDenial {
  if (!(error instanceof ConvexError) || typeof error.data !== "object" || error.data === null ||
    !("code" in error.data) || typeof error.data.code !== "string") {
    return denied("online_admission_required", "unlock-online");
  }
  const code = error.data.code;
  const deviceDenial = accessDenials.find((known) => known === code);
  if (deviceDenial) return denied(code, directiveFor(deviceDenial));
  switch (code) {
    case "authentication_required":
    case "owner_not_allowed":
    case "workspace_membership_required":
      return denied(code, "wipe-local-input-and-sign-out");
    case "workspace_permission_required":
    case "owner_configuration_required":
      return denied(code, "block-action");
    default:
      return denied(code, "unlock-online");
  }
}

export async function admitForeground(input: {
  transport: ForegroundAdmissionTransport;
  hash: NativeRequestHash;
  key: Pick<NativeDeviceKey, "publicKey" | "sign">;
  workspace: { kind: "discover" } | { kind: "saved"; workspaceId: string };
}): Promise<ForegroundAdmission> {
  try {
    const status = await input.transport.status({});
    if (status.kind === "denied") return denied(status.code, status.directive);
    const deviceId = status.device.id;
    const proofPorts = { transport: input.transport, hash: input.hash, key: input.key, deviceId };
    await input.transport.heartbeat(await proveDeviceRequest({
      ...proofPorts, operation: "devices.heartbeat", request: {},
    }));
    const authority = await input.transport.localInputAuthority(await proveDeviceRequest({
      ...proofPorts, operation: "accounting.localInputAuthority",
      request: input.workspace.kind === "discover" ? {} : { workspaceId: input.workspace.workspaceId },
    }));
    if (authority.kind === "provisioning-required") {
      return { kind: "provisioning-required", localInput: "blocked", deviceId };
    }
    return { kind: "ready", localInput: "allowed", workspaceId: authority.workspaceId, deviceId };
  } catch (error) {
    return admissionFailure(error);
  }
}
