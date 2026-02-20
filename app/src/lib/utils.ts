import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Shared locale for number/date formatting across the app */
export const APP_LOCALE = "en-GB" as const;

/** Format a percentage value for display. Returns "—" for null/undefined/NaN. */
export function formatPct(pct: number | string | null | undefined): string {
  if (pct == null) return "—";
  const n = typeof pct === "string" ? parseFloat(pct) : pct;
  if (isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

/** Format a number with locale-appropriate thousands separators. Returns "—" for null/undefined. */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString(APP_LOCALE);
}
