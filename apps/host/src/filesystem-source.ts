import { lstat, readFile, realpath, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { SourceBundleView, SourceEntry, VirtualSource } from "@agentjourney/plugin-sdk";

function portableRelative(value: string): string {
  return value.split(path.sep).join("/");
}

export class FilesystemSource implements VirtualSource {
  readonly rootId: string;
  private constructor(private readonly root: string) {
    this.rootId = root;
  }

  static async open(root: string): Promise<FilesystemSource> {
    const resolved = await realpath(path.resolve(root));
    const metadata = await stat(resolved);
    if (!metadata.isDirectory()) throw new Error(`Source Root is not a directory: ${root}`);
    return new FilesystemSource(resolved);
  }

  async list(): Promise<readonly SourceEntry[]> {
    const entries: SourceEntry[] = [];
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          await visit(absolutePath);
          continue;
        }
        if (!entry.isFile()) continue;
        const metadata = await lstat(absolutePath);
        entries.push({
          path: portableRelative(path.relative(this.root, absolutePath)),
          size: metadata.size,
          modifiedAt: metadata.mtime.toISOString()
        });
      }
    };
    await visit(this.root);
    return entries.sort((left, right) => left.path.localeCompare(right.path));
  }

  async readBytes(relativePath: string): Promise<Uint8Array> {
    const absolutePath = await this.resolveContained(relativePath);
    const before = await lstat(absolutePath);
    const bytes = await readFile(absolutePath);
    const after = await lstat(absolutePath);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`Source file changed during Capture Cycle: ${relativePath}`);
    }
    return bytes;
  }

  async readText(relativePath: string): Promise<string> {
    return readFile(await this.resolveContained(relativePath), "utf8");
  }

  private async resolveContained(relativePath: string): Promise<string> {
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes("..")) {
      throw new Error(`Path escapes Source Root: ${relativePath}`);
    }
    const candidate = await realpath(path.resolve(this.root, relativePath));
    const relation = path.relative(this.root, candidate);
    if (relation.startsWith("..") || path.isAbsolute(relation)) {
      throw new Error(`Path escapes Source Root: ${relativePath}`);
    }
    const metadata = await lstat(candidate);
    if (!metadata.isFile()) throw new Error(`Source path is not a file: ${relativePath}`);
    return candidate;
  }
}

export class CapturedBundle implements SourceBundleView, VirtualSource {
  readonly rootId = "captured-source-bundle";
  readonly paths: readonly string[];
  private readonly files: Map<string, Uint8Array>;

  private constructor(files: Map<string, Uint8Array>) {
    this.files = files;
    this.paths = [...files.keys()].sort();
  }

  static async fromSource(source: VirtualSource, paths: readonly string[]): Promise<CapturedBundle> {
    const files = new Map<string, Uint8Array>();
    for (const relativePath of [...new Set(paths)].sort()) {
      files.set(relativePath, await source.readBytes(relativePath));
    }
    return new CapturedBundle(files);
  }

  static fromFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): CapturedBundle {
    return new CapturedBundle(new Map(files.map((file) => [file.relativePath, file.bytes.slice()])));
  }

  list(): readonly SourceEntry[] {
    return this.paths.map((filePath) => ({ path: filePath, size: this.files.get(filePath)?.byteLength ?? 0 }));
  }

  readBytes(relativePath: string): Uint8Array {
    const bytes = this.files.get(relativePath);
    if (!bytes) throw new Error(`Source Bundle does not contain ${relativePath}`);
    return bytes.slice();
  }

  readText(relativePath: string): string {
    return new TextDecoder().decode(this.readBytes(relativePath));
  }

  has(relativePath: string): boolean {
    return this.files.has(relativePath);
  }
}
