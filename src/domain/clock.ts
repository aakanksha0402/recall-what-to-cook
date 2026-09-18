import type { MealSlot } from './types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function mealSlotFor(date: Date): MealSlot {
  const h = date.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  return 'dinner';
}

export function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

export function dayLabel(date: Date, slot: MealSlot): string {
  return `${DAYS[date.getDay()]} · ${capitalise(slot)}`;
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const ta = typeof a === 'string' ? Date.parse(a) : a.getTime();
  const tb = typeof b === 'string' ? Date.parse(b) : b.getTime();
  return Math.floor(Math.abs(tb - ta) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** "30 Jun" / "2 Sep" — short day-month, no year. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function startOfMonthIso(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

/** "Just now" / "3 days ago" / "12 Aug" */
export function relativeDate(iso: string, now = new Date()): string {
  const days = daysBetween(iso, now);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return shortDate(iso);
}
