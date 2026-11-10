/** True when a name has at least one character a person can see: not only spaces, marks or invisible formatting. */
export function hasVisibleText(name: string): boolean {
  return /[^\p{Cf}\p{Cc}\p{Z}\p{M}]/u.test(name);
}
