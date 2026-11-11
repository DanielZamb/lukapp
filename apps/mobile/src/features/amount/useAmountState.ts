import { useCallback, useRef, useState } from "react";
import { openingOf, type AmountAtPress, type AmountOpening, type AmountSession } from "./session";

/** `T` with every amount in it read at the moment of a press. */
export type AtPress<T> = T extends AmountSession ? AmountAtPress
  : T extends readonly (infer Item)[] ? readonly AtPress<Item>[]
  : T extends object ? { readonly [Key in keyof T]: AtPress<T[Key]> }
  : T;

/** The openings of the amounts in a plain value: its sessions, and those in its arrays and plain objects. */
function openingsIn(value: unknown, found = new Set<AmountOpening>(), seen = new Set<object>()): Set<AmountOpening> {
  if (typeof value !== "object" || value === null || seen.has(value)) return found;
  seen.add(value);
  const opening = openingOf(value);
  if (opening) found.add(opening);
  else if (Array.isArray(value)) for (const item of value) openingsIn(item, found, seen);
  else if ([Object.prototype, null].includes(Object.getPrototypeOf(value)))
    for (const item of Object.values(value)) openingsIn(item, found, seen);
  return found;
}

/**
 * State that holds amounts, the one way an owner keeps them. Render with the value. A handler reads the amount with
 * `read()`, which returns the state as of its latest change, never a render's copy: a bottom sheet's portal hands out
 * the previous render's handlers, and one that closed over the value would send the amount from before the last
 * keystroke. Only `read()` gives the amounts `sendableMinorUnits` accepts. `set` takes a value or a function of the
 * latest one.
 *
 * An amount the state stops holding, because the owner replaced it with a new opening or dropped it, is retired: an
 * update that would bring back an amount of a retired opening is refused whole, and `set` says so. That is a change
 * event from the field's input before the owner's replacement reached it, typed under the old currency or text; the
 * field then shows the owner's amount in a new input. Updates of the amounts the state holds, and amounts it has
 * never held, are taken.
 */
export function useAmountState<T>(initial: T | (() => T)) {
  const [value, setValue] = useState(initial);
  const latest = useRef(value);
  const retired = useRef(new WeakSet<AmountOpening>());
  const set = useCallback((next: T | ((current: T) => T)) => {
    const update = typeof next === "function" ? (next as (current: T) => T)(latest.current) : next;
    const after = openingsIn(update);
    for (const opening of after) if (retired.current.has(opening)) return false;
    for (const opening of openingsIn(latest.current)) if (!after.has(opening)) retired.current.add(opening);
    latest.current = update;
    setValue(update);
    return true;
  }, []);
  const read = useCallback(() => latest.current as unknown as AtPress<T>, []);
  return [value, set, read] as const;
}

/** `T` as a press reads it from `useFormState`: its amounts read at the press, its other values, ids and functions as they are. */
export type ReadAtPress<T> = T extends AmountSession ? AmountAtPress
  : T extends string | number | boolean | bigint | symbol | null | undefined ? T
  : T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer Item)[] ? readonly ReadAtPress<Item>[]
  : T extends object ? { readonly [Key in keyof T]: ReadAtPress<T[Key]> }
  : T;

/**
 * Everything a command is built from, held the one way a press can read it. Render with the value; a handler reads
 * `read()` and builds and validates its command from that one snapshot, never from a render's copy of a field or
 * anything computed from it. Amounts inside read as `useAmountState` reads them.
 */
export function useFormState<T>(initial: T | (() => T)) {
  const [value, set, read] = useAmountState(initial);
  return [value, set, read as () => unknown as () => ReadAtPress<T>] as const;
}

/** `now` with the fields of `patch`, or `now` itself when no field changes, so React keeps the render it has. */
export function withFields<T extends object>(now: T, patch: Partial<T>): T {
  return (Object.keys(patch) as (keyof T)[]).every((key) => Object.is(now[key], patch[key])) ? now : { ...now, ...patch };
}
