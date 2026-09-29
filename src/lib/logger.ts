/* Minimal structured logger. Keeps technical detail server-side. */

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta } : {}),
  };
  const serialized = JSON.stringify(line, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v,
  );
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
