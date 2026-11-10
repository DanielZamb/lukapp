/** An in-memory stand-in for the `expo-file-system` classes the report flow uses. */
export function memoryFileSystem() {
  const files = new Map<string, { content: string; encoding: string; modified: number }>();
  const directories = new Set<string>();
  const clock = { now: 0 };
  const join = (parts: unknown[]) =>
    parts
      .map((part) => (typeof part === "string" ? part : (part as { uri: string }).uri))
      .map((part, index) => (index === 0 ? part.replace(/\/$/, "") : part.replace(/^\/|\/$/g, "")))
      .join("/");
  class File {
    readonly uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    get modificationTime() {
      return files.get(this.uri)?.modified ?? null;
    }
    create() {
      files.set(this.uri, { content: "", encoding: "utf8", modified: clock.now });
    }
    write(content: string, options?: { encoding?: string }) {
      files.set(this.uri, { content, encoding: options?.encoding ?? "utf8", modified: clock.now });
    }
    async bytes() {
      return new TextEncoder().encode(files.get(this.uri)?.content ?? "");
    }
    delete() {
      if (!files.delete(this.uri)) throw new Error(`Missing ${this.uri}`);
    }
  }
  class Directory {
    readonly uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return directories.has(this.uri);
    }
    create() {
      directories.add(this.uri);
    }
    delete() {
      directories.delete(this.uri);
      for (const uri of [...files.keys()]) if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
    }
    list() {
      return [...files.keys()].filter((uri) => uri.startsWith(`${this.uri}/`)).map((uri) => new File(uri));
    }
  }
  const Paths = { cache: new Directory("file:///cache") };
  return { module: { File, Directory, Paths }, files, directories, clock };
}
