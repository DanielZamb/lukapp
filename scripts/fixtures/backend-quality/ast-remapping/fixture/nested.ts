export function parent(x: number) {
  const observed = 1;
  if (x === 0) return () => 0;
  if (x === 1) return () => 1;
  if (x === 2) return () => 2;
  if (x === 3) return () => 3;
  if (x === 4) return () => 4;
  if (x === 5) return () => 5;
  if (x === 6) return () => 6;
  if (x === 7) return () => 7;
  if (x === 8) return () => 8;
  return observed;
}
export function chosen(flag: boolean) {
  return flag ? () => 1 : () => 2;
}
export function mapped(values: number[]) {
  return values.map(value => value > 1 ? value : 0);
}
