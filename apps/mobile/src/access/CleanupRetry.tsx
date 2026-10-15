import type { AccessController } from "./controller";
import { PrimaryButton } from "../ui";

export function CleanupRetry({ controller, pending }: { controller: Pick<AccessController, "wipe">; pending: boolean }) {
  return <PrimaryButton label="Retry local cleanup" loading={pending} onPress={() => { void controller.wipe(); }} />;
}
