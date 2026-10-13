export function commandIdentity(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) => {
    if (item !== null && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    return item;
  });
}
