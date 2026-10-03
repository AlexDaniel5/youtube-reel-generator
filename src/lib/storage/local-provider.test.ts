import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "./local-provider";
import { AppError } from "@/lib/errors";

describe("LocalStorageProvider", () => {
  let root: string;
  let storage: LocalStorageProvider;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
    storage = new LocalStorageProvider(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("round-trips bytes and creates parent directories", async () => {
    await storage.save(Buffer.from("hello"), "projects/p1/clips/c1.mp4");
    expect(await storage.exists("projects/p1/clips/c1.mp4")).toBe(true);
    expect((await storage.get("projects/p1/clips/c1.mp4")).toString()).toBe("hello");
    expect(await storage.localPath("projects/p1/clips/c1.mp4")).toBe(
      path.join(root, "projects/p1/clips/c1.mp4"),
    );
  });

  it("reports missing objects", async () => {
    expect(await storage.exists("projects/nope.mp4")).toBe(false);
    expect(await storage.localPath("projects/nope.mp4")).toBeNull();
    await expect(storage.get("projects/nope.mp4")).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
    });
  });

  it("rejects keys that escape the root with a 4xx AppError", async () => {
    for (const key of ["../outside.txt", "projects/../../outside.txt", "/etc/passwd"]) {
      const err = await storage.exists(key).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
    }
  });

  it("deletes objects idempotently", async () => {
    await storage.save(Buffer.from("x"), "projects/p1/a.mp4");
    await storage.delete("projects/p1/a.mp4");
    await storage.delete("projects/p1/a.mp4");
    expect(await storage.exists("projects/p1/a.mp4")).toBe(false);
  });
});
