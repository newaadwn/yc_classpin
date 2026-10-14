export function sessionRuntime(start: string | null | undefined, end: string | null | undefined, live: boolean, now: number): string {
  const from = Date.parse(start ?? "");
  const to = live ? now : Date.parse(end ?? "");
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "--:--:--";
  const seconds = Math.max(0, Math.floor((to - from) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
}
