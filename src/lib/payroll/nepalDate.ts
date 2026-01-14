// lib/payroll/nepalDate.ts

export const NPT_OFFSET_MIN = 5 * 60 + 45; // +05:45
export const NPT_OFFSET_MS = NPT_OFFSET_MIN * 60 * 1000;

export function isYMD(s: string | null | undefined) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function ymdFromDateNPT(d: Date): string {
  // Convert a UTC instant -> NPT calendar date key YYYY-MM-DD
  const nptMs = d.getTime() + NPT_OFFSET_MS;
  const nd = new Date(nptMs);
  const y = nd.getUTCFullYear();
  const m = String(nd.getUTCMonth() + 1).padStart(2, "0");
  const day = String(nd.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ymdToUTCStartOfDay(ymd: string): Date {
  // ymd is a local-NPT calendar day
  // local 00:00 NPT -> UTC = local - offset
  const [y, m, d] = ymd.split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, d) - NPT_OFFSET_MS;
  return new Date(utcMs);
}

export function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + days * 86400000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function dayOfWeekFromYMD(ymd: string): number {
  // 0=Sun ... 6=Sat (weekday for that calendar date is timezone independent)
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function roundPerDay(raw: number, mode: "none" | "floor" | "round" | "ceil") {
  if (mode === "floor") return Math.floor(raw);
  if (mode === "ceil") return Math.ceil(raw);
  if (mode === "round") return Math.round(raw);
  return raw;
}
