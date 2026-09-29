import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Sanitize a user- or model-provided string into a safe filename fragment.
 * Strips path separators, control chars, and anything non-alphanumeric.
 */
export function sanitizeFilename(input: string, fallback = "file"): string {
  const base = input
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_") // keep word chars, dot, hyphen
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return base.length > 0 ? base : fallback;
}

/** A random, collision-resistant filename with the given extension. */
export function randomFilename(ext: string): string {
  const clean = ext.replace(/^\.+/, "");
  return `${randomUUID()}.${clean}`;
}

/**
 * Resolve `candidate` and assert it stays within `root`. Throws on traversal.
 * Use this before any filesystem access driven by external input.
 */
export function resolveWithin(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes storage root: ${candidate}`);
  }
  return resolved;
}
