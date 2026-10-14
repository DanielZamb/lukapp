export class RecoveryError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function minor(value: number, positive = false): number {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new RecoveryError("recovery_amount_invalid");
  return value;
}
export function total(values: number[]): number {
  return minor(Number(values.reduce((sum, value) => sum + BigInt(minor(value)), 0n)));
}
export function proportional<T>(amount: number, parts: readonly T[], weight: (part: T) => number) {
  const weighted = parts.map(part => ({ part, weight: weight(part) }));
  const weights = weighted.map(item => item.weight);
  const sum = total(weights);
  if (amount === 0) return weighted.map(({ part }) => ({ part, amountMinor: 0 }));
  if (amount > sum || sum === 0) throw new RecoveryError("recovery_capacity_exceeded");
  const shares = weighted.map(({ part, weight }, index) => ({
    part, index,
    value: Number(BigInt(amount) * BigInt(weight) / BigInt(sum)),
    residual: BigInt(amount) * BigInt(weight) % BigInt(sum),
  }));
  let rest = amount - total(shares.map(share => share.value));
  const order = [...shares]
    .sort((a, b) => a.residual === b.residual ? a.index - b.index : a.residual > b.residual ? -1 : 1);
  for (const share of order) {
    if (rest === 0) break;
    share.value++;
    rest--;
  }
  return shares.map(({ part, value }) => ({ part, amountMinor: value }));
}
export function text(value: string): string {
  if (!value.trim()) throw new RecoveryError("recovery_text_required");
  return value;
}
