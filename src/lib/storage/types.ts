/**
 * Abstraction over where generated media lives. Paths are always relative,
 * POSIX-style keys (e.g. `projects/<id>/source.mp4`); the provider decides how
 * they map to real storage. Local filesystem today, S3-compatible later.
 */
export interface StorageProvider {
  readonly name: string;
  /** Write bytes at `key`, creating any intermediate "directories". */
  save(bytes: Uint8Array, key: string): Promise<void>;
  /** Read the full object at `key`. */
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /**
   * Absolute local path for `key` when the object exists on local disk (FFmpeg
   * needs a real file), or null when it doesn't.
   */
  localPath(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}
