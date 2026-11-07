import * as Crypto from "expo-crypto";
import { notificationIntake } from "../../../modules/notification-intake";
import { drainLocalInputWrites } from "../../local-auth/localInput";
import { clearDiscardNotices } from "../localDiscardNotices";
import { clearIntakeCandidates } from "./candidates";
import { finishIntakeWipe, secureWipeStore } from "./control";
import { stopIntake } from "./registry";

export async function clearNativeIntake(subject: string) {
  stopIntake(subject);
  await drainLocalInputWrites(subject);
  await finishIntakeWipe({ native: notificationIntake, store: secureWipeStore(subject), newMutationId: Crypto.randomUUID,
    deleteLegacy: () => clearIntakeCandidates(subject), deleteNotices: () => clearDiscardNotices(subject),
    read: async <T>(promise: Promise<T>) => promise,
    write: async (operation) => { await operation(); },
  });
}
