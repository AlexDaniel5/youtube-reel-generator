import { promises as fs } from "node:fs";
import path from "node:path";
import { errors } from "@/lib/errors";
import { resolveWithin } from "@/utils/fs";
import type { StorageProvider } from "./types";

/**
 * Local filesystem storage rooted at a single directory. Every key is resolved
 * through `resolveWithin`, so a key that escapes the root (e.g. `../../.env`)
 * is rejected as a client error rather than touching the filesystem.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    try {
      return resolveWithin(this.root, key);
    } catch {
      throw errors.validation("Invalid media path.");
    }
  }

  async save(bytes: Uint8Array, key: string): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }

  async get(key: string): Promise<Buffer> {
    const target = this.resolve(key);
    try {
      return await fs.readFile(target);
    } catch {
      throw errors.fileNotFound();
    }
  }

  async exists(key: string): Promise<boolean> {
    const target = this.resolve(key);
    try {
      return (await fs.stat(target)).isFile();
    } catch {
      return false;
    }
  }

  async localPath(key: string): Promise<string | null> {
    return (await this.exists(key)) ? this.resolve(key) : null;
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}
