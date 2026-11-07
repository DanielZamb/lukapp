import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { relative, resolve } from "node:path";
import { expect, test } from "vitest";

const ENFORCE = false;
export const BASELINE_NUMERIC_FONT_SIZES = 107;
export const BASELINE_REFLOW_REFERENCES = 34;
const mobile = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (/formal|fixtures|__tests__|^ui$/.test(entry.name)) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[jt]sx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [path] : [];
  });
}

test("report screen typography and reflow adoption", () => {
  const files = [...sourceFiles(resolve(mobile, "app")), ...sourceFiles(resolve(mobile, "src"))];
  let fontSizes = 0;
  let reflows = 0;
  for (const path of files.sort()) {
    const source = readFileSync(path, "utf8");
    const sizes = (source.match(/fontSize:\s*\d/g) ?? []).length;
    const branches = (source.match(/layout\.reflow/g) ?? []).length;
    fontSizes += sizes;
    reflows += branches;
    if (sizes || branches) console.warn(`${relative(mobile, path)} fontSize=${sizes} layout.reflow=${branches}`);
  }
  console.warn(`Total fontSize=${fontSizes} layout.reflow=${reflows}; baseline=${BASELINE_NUMERIC_FONT_SIZES}/${BASELINE_REFLOW_REFERENCES}; ENFORCE=${ENFORCE}`);
  if (ENFORCE) {
    expect(fontSizes).toBe(0);
    expect(reflows).toBe(0);
  }
});
