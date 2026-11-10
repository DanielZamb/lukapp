/** True when a name has at least one character a person can see: not only spaces, marks or invisible formatting. */
export function hasVisibleText(name: string): boolean {
  return /[^\p{Cf}\p{Cc}\p{Z}\p{M}]/u.test(name);
}

/** Two Place names are the same when they differ only in case, accents or spacing. */
export function comparableName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ")
    .normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
