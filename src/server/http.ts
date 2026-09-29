import { NextResponse } from "next/server";
import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Standard success envelope. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

/**
 * Map any thrown error to a JSON response with a user-safe message and typed
 * code. Technical detail is logged, never returned.
 */
export function fail(e: unknown) {
  const err = toAppError(e);
  if (err.status >= 500) {
    logger.error("request failed", { code: err.code, message: err.message, cause: err.cause });
  }
  return NextResponse.json(
    { ok: false, error: { code: err.code, message: err.message } },
    { status: err.status },
  );
}
