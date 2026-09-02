import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

export interface StoredObject {
  hash: string;
  size: number;
  storedSize: number;
  created: boolean;
}

export class ContentObjectStore {
  constructor(private readonly root: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(this.root, 0o700);
  }

  objectPath(hash: string): string {
    if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error(`invalid object hash: ${hash}`);
    return path.join(this.root, hash.slice(0, 2), `${hash.slice(2)}.gz`);
  }

  async put(bytes: Uint8Array): Promise<StoredObject> {
    const hash = createHash("sha256").update(bytes).digest("hex");
    const destination = this.objectPath(hash);
    try {
      await access(destination, constants.R_OK);
      const stored = await readFile(destination);
      return { hash, size: bytes.byteLength, storedSize: stored.byteLength, created: false };
    } catch {
      // Continue with an atomic write.
    }

    const compressed = gzipSync(bytes, { level: 9 });
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporary, compressed, { mode: 0o600, flag: "wx" });
    try {
      await rename(temporary, destination);
    } catch (error) {
      try {
        await access(destination, constants.R_OK);
        await rm(temporary, { force: true });
      } catch {
        throw error;
      }
    }
    if (process.platform !== "win32") await chmod(destination, 0o600);
    return { hash, size: bytes.byteLength, storedSize: compressed.byteLength, created: true };
  }

  async get(hash: string): Promise<Uint8Array> {
    return gunzipSync(await readFile(this.objectPath(hash)));
  }

  async has(hash: string): Promise<boolean> {
    try {
      await access(this.objectPath(hash), constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async remove(hash: string): Promise<void> {
    await rm(this.objectPath(hash), { force: true });
  }

  async listHashes(): Promise<string[]> {
    const hashes: string[] = [];
    for (const prefix of await readdir(this.root, { withFileTypes: true })) {
      if (!prefix.isDirectory() || !/^[a-f0-9]{2}$/u.test(prefix.name)) continue;
      const directory = path.join(this.root, prefix.name);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^[a-f0-9]{62}\.gz$/u.test(entry.name)) continue;
        hashes.push(`${prefix.name}${entry.name.slice(0, -3)}`);
      }
    }
    return hashes.sort();
  }
}
