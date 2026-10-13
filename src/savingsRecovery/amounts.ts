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
export function proportional(amount: number, weights: number[]): number[] {
  const sum = total(weights);
  if (amount === 0) return weights.map(() => 0);
  if (amount > sum || sum === 0) throw new RecoveryError("recovery_capacity_exceeded");
  const shares = weights.map(weight => ({
    value: Number(BigInt(amount) * BigInt(weight) / BigInt(sum)),
    residual: BigInt(amount) * BigInt(weight) % BigInt(sum),
  }));
  let rest = amount - total(shares.map(share => share.value));
  const order = shares.map((share, index) => ({ ...share, index }))
    .sort((a, b) => a.residual === b.residual ? a.index - b.index : a.residual > b.residual ? -1 : 1);
  for (const share of order) {
    if (rest === 0) break;
    shares[share.index].value++;
    rest--;
  }
  return shares.map(share => share.value);
}
export function text(value: string): string {
  if (!value.trim()) throw new RecoveryError("recovery_text_required");
  return value;
}
