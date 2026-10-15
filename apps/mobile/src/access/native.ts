import { requireNativeModule, NativeModule } from "expo-modules-core";
import { derSignatureToP1363 } from "../../../../src/access/protocol";
import type { NativeDeviceKey } from "../../../../src/access/protocol";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { LocalInputCustody } from "./input-contract";

export type NativeState = {
  mode: "live" | "fixture";
  generation: number;
  unlocked: boolean;
  wipePending: boolean;
  installed: boolean;
  workspaceId: string | null;
  keyPresent: boolean;
  protection: string;
  savedWorkspaceId: string | null;
};
export declare class Custody extends NativeModule<{ change: () => void }> implements LocalInputCustody {
  state(): NativeState;
  initialize(mode: "live" | "fixture", generation: number): Promise<NativeState>;
  unlock(reason: string): Promise<NativeState>;
  resumeAdmission(): NativeState | null;
  lock(): void;
  touch(): void;
  publicKey(generation: number): Promise<string>;
  sign(message: string, generation: number): Promise<{ format: "der" | "p1363"; signature: string }>;
  setScreen(screen: "ordinary" | "month-close"): void;
  deleteKey(): Promise<void>;
  openInput(workspaceId: string, generation: number, serverContactAt: number): Promise<void>;
  enrollmentPending(sessionDigest: string, generation: number): boolean;
  setEnrollmentPending(sessionDigest: string | null, generation: number): Promise<void>;
  closeInput(): void;
  inputPut(owner: "draft" | "candidate", id: string, content: string, generation: number): Promise<void>;
  inputList(owner: "draft" | "candidate", generation: number): Promise<string[]>;
  inputDelete(owner: "draft" | "candidate", id: string, generation: number): Promise<void>;
  beginWipe(mode: "live" | "fixture"): Promise<void>;
  erase(mode: "live" | "fixture"): Promise<void>;
  finishWipe(mode: "live" | "fixture"): Promise<void>;
  recoveryPending(): boolean;
  recoveryIntent(mode: "live" | "fixture"): Id<"clerkRecoveryIntents"> | "retrieve" | null;
  setRecoveryIntent(intentId: Id<"clerkRecoveryIntents">, mode: "live" | "fixture"): Promise<void>;
  setRecoveryPending(pending: boolean, mode: "live" | "fixture"): Promise<void>;
  recoveryWork(mode: "live" | "fixture"): Id<"clerkProviderWork"> | null;
  setRecoveryWork(workId: Id<"clerkProviderWork"> | null, mode: "live" | "fixture", generation: number): Promise<void>;
}
export const custody = requireNativeModule<Custody>("LukappCustody");
export const nativeDeviceKey = (generation: number): NativeDeviceKey => ({
  publicKey: () => custody.publicKey(generation),
  sign: async message => {
    const result = await custody.sign(message, generation);
    return result.format === "der" ? derSignatureToP1363(result.signature) : result.signature;
  },
  delete: () => custody.deleteKey(),
});
