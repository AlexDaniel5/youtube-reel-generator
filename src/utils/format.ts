/** Format a number of seconds as HH:MM:SS (or MM:SS below an hour). */
export function formatTimecode(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Human duration, e.g. "44 seconds" / "1 min 12 sec". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m} min` : `${m} min ${rem} sec`;
}
