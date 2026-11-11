/**
 * What a confirmation step shows, bound to one opening of the step. The confirming control hands back the `Shown` it
 * rendered; the press acts on that snapshot, and only while the same opening is still the open step and the screen
 * would still show the same values. Requesting a confirmation and confirming it are different actions, so a second
 * press of the control that asked can only ask again.
 */
export type Shown<S> = Readonly<{ generation: number; snapshot: S }>;

let generations = 0;

/** Opens a confirmation step showing `snapshot`; each opening has its own generation. */
export function showing<S>(snapshot: S): Shown<S> {
  generations += 1;
  return Object.freeze({ generation: generations, snapshot });
}

/**
 * The outcome of a confirming press. `stale`: the pressed control belongs to a step that is no longer open, such as
 * one already confirmed or withdrawn; nothing happens. `changed`: the step is open but what it showed no longer
 * matches `current`, what the screen would show now; the step is withdrawn and the person is told. `confirmed`: act on
 * `pressed.snapshot` and nothing else.
 */
export function confirmShown<S>(
  open: Readonly<{ generation: number }> | null | undefined,
  pressed: Shown<S>,
  current: unknown,
): "confirmed" | "changed" | "stale" {
  if (!open || open.generation !== pressed.generation) return "stale";
  return current !== null && current !== undefined && sameValue(current, pressed.snapshot) ? "confirmed" : "changed";
}

/** Whether two plain values are the same: equal primitives, or arrays and plain objects with the same entries. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key)
    && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
