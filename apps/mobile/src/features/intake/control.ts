import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import type { NotificationIntakeNative } from "../../../modules/notification-intake";

const wipeCommandSchema = z.object({
  expectedEpoch: z.string().regex(/^[A-Za-z0-9_-]{22}$/), mutationId: z.uuid(),
}).strict();
const wipeIntentSchema = z.union([wipeCommandSchema, z.object({ kind: z.literal("native_required") }).strict()]);
export type WipeIntent = z.infer<typeof wipeIntentSchema>;
export type WipeStore = {
  read(): Promise<WipeIntent | null>;
  write(intent: WipeIntent): Promise<void>;
  clear(): Promise<void>;
};
export function wipeIntentKey(subject: string) { return `u08.intake-wipe.${subject}`; }
export function secureWipeStore(subject: string): WipeStore {
  return {
    async read() {
      const value = await SecureStore.getItemAsync(wipeIntentKey(subject));
      return value === null ? null : wipeIntentSchema.parse(JSON.parse(value));
    },
    async write(intent) { await SecureStore.setItemAsync(wipeIntentKey(subject), JSON.stringify(wipeIntentSchema.parse(intent))); },
    async clear() { await SecureStore.deleteItemAsync(wipeIntentKey(subject)); },
  };
}
export async function finishIntakeWipe(input: {
  native: NotificationIntakeNative;
  store: WipeStore;
  newMutationId(): string;
  deleteLegacy(): Promise<void>;
  deleteNotices(): Promise<void>;
  read<T>(promise: Promise<T>): Promise<T>;
  write(operation: () => Promise<unknown>): Promise<void>;
}) {
  let intent = await input.read(input.store.read());
  const status = await input.read(input.native.getStatus());
  if (!("epoch" in status) && (status.reason === "native_module_missing" || status.reason === "native_api_incompatible" || intent !== null)) {
    if (!intent) await input.write(() => input.store.write({ kind: "native_required" }));
    throw Object.assign(new Error("NATIVE_WIPE_REQUIRED"), { code: "NATIVE_WIPE_REQUIRED" });
  }
  if ("epoch" in status && (!intent || !("expectedEpoch" in intent) || (status.storageState !== "healthy" && intent.expectedEpoch !== status.epoch))) {
    intent = { expectedEpoch: status.epoch, mutationId: input.newMutationId() };
    const saved = intent;
    await input.write(() => input.store.write(saved));
  }
  if (intent && "expectedEpoch" in intent) {
    const command = intent;
    await input.write(() => input.native.disableAndWipe(command));
  }
  await input.write(input.deleteLegacy);
  await input.write(input.deleteNotices);
  await input.write(() => input.store.clear());
}
