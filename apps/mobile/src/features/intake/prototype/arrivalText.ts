// PROTOTYPE: pull the original title and body out of a beta diagnostic
// snapshot (DiagnosticValues.kt encoding: {type, status, value | entries |
// fields | values}). Unknown shapes return empty text rather than throwing.

type Node = { value?: unknown; entries?: { name?: Node; value?: Node }[]; fields?: unknown; values?: Node[] } | null | undefined;

function asNode(value: unknown): Node {
  return value !== null && typeof value === "object" ? value as Node : null;
}

function text(node: Node): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  if (Array.isArray(node.values)) return node.values.map(text).filter(Boolean).join("\n");
  return "";
}

/** Key → node for an encoded map, or a plain object of nodes. */
function children(node: Node): Map<string, Node> {
  const result = new Map<string, Node>();
  if (!node) return result;
  if (Array.isArray(node.entries)) {
    for (const entry of node.entries) {
      const key = entry?.name?.value;
      if (typeof key === "string") result.set(key, entry.value);
    }
  }
  const fields = asNode(node.fields);
  if (fields && !("type" in fields && "status" in fields)) {
    for (const [key, value] of Object.entries(fields)) result.set(key, asNode(value));
  } else if (fields) {
    for (const [key, value] of children(fields)) result.set(key, value);
  }
  return result;
}

function find(node: Node, key: string, depth = 0): Node {
  if (!node || depth > 6) return null;
  const direct = children(node);
  if (direct.has(key)) return direct.get(key);
  for (const child of direct.values()) {
    const found = find(child, key, depth + 1);
    if (found) return found;
  }
  return null;
}

export function arrivalText(snapshot: unknown): { title: string; text: string } {
  const root = asNode(snapshot);
  const original = find(root, "originalTextFields") ?? root;
  const field = (key: string) => text(find(original, key));
  const body = field("android.bigText") || field("android.text") || field("android.textLines") || field("android.subText");
  return { title: field("android.title"), text: body };
}
