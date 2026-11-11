import type { AmountAtPress, AmountSession } from "./session";

/** A session as a handler holding it in `useAmountState` would read it at the moment of a press. */
export function pressed(session: AmountSession): AmountAtPress {
  return session as AmountAtPress;
}
