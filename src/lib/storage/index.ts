import { config } from "@/lib/config";
import { LocalStorageProvider } from "./local-provider";
import type { StorageProvider } from "./types";

let instance: StorageProvider | null = null;

/** Resolve the configured storage provider (one instance per process). */
export function getStorage(): StorageProvider {
  if (instance) return instance;
  switch (config.storage.provider) {
    case "local":
    default:
      instance = new LocalStorageProvider(config.storage.path);
  }
  return instance;
}

export type { StorageProvider } from "./types";
