import { createContext, useContext } from "react";

const writes = new Map<string, Promise<void>>();
// One lease per local admission. A transport retains this exact lease after unmount.
export class LocalInputLease {
  private denied = false;
  constructor(readonly subject: string, readonly sessionId: string) {}
  deny() { this.denied = true; }
  run(operation: () => Promise<void>): Promise<void> {
    const write = (writes.get(this.subject) ?? Promise.resolve()).then(() => {
      if (this.denied) throw new Error("Local input admission ended");
      return operation();
    });
    writes.set(this.subject, write.catch(() => {}));
    return write;
  }
}
export async function drainLocalInputWrites(subject: string) { await writes.get(subject); }

export const LocalInput = createContext<LocalInputLease | null>(null);
export function useLocalInputLease() {
  const lease = useContext(LocalInput);
  if (!lease) throw new Error("Local input requires an unlocked admission");
  return lease;
}
// Fence clears as well as saves: an old acknowledgement must not clear a new entry.
export function runLocalInputWrite(lease: LocalInputLease, operation: () => Promise<void>) {
  return lease.run(operation);
}
