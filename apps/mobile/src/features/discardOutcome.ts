/**
 * What happened when the person asked to discard one unposted input on this phone.
 * `changed`: it changed since it was shown, so nothing was removed. `frozen`: its command was already
 * dispatched with an unknown outcome, so it stays for retry. `gone`: it was no longer on this phone.
 */
export type DiscardOutcome = "discarded" | "changed" | "frozen" | "gone";
