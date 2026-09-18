import { daysBetween, monthKey } from './clock';
import type { Bucket, DishStatus, Origin } from './types';

export interface BucketInput {
  status: DishStatus;
  origin: Origin;
  pinned: boolean;
  isBase: boolean;
  baseId: number | null;
  cookDates: string[];
  childCookDates: string[];
  /** created_at of the current version when it was made after the last cook, else null */
  tweakAddedAt: string | null;
  forgottenDays: number;
  now: Date;
}

export interface BucketResult {
  bucket: Bucket;
  reason: string;
  gapDays: number | null;
  medianDays: number | null;
  cookCount: number;
}

export function sortedDates(dates: string[]): string[] {
  return [...dates].sort();
}

export function medianIntervalDays(dates: string[]): number | null {
  const d = sortedDates(dates);
  if (d.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < d.length; i++) gaps.push(daysBetween(d[i - 1]!, d[i]!));
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid]! : Math.round((gaps[mid - 1]! + gaps[mid]!) / 2);
}

export function cooksInLastDays(dates: string[], days: number, now: Date): number {
  return dates.filter((d) => daysBetween(d, now) < days).length;
}

export function lastCook(dates: string[]): string | null {
  const d = sortedDates(dates);
  return d.length ? d[d.length - 1]! : null;
}

export function distinctMonths(dates: string[]): number {
  return new Set(dates.map(monthKey)).size;
}

function spanLabel(dates: string[]): string {
  const d = sortedDates(dates);
  if (d.length < 2) return '';
  const days = daysBetween(d[0]!, d[d.length - 1]!);
  if (days >= 700) return `${Math.round(days / 365)} years`;
  if (days >= 330) return 'a year';
  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? 'a month' : `${months} months`;
}

export function bucketFor(input: BucketInput): BucketResult {
  const { now } = input;
  const own = input.cookDates;
  // A base cooked only through its variations keeps its children's recency (spec §10).
  const effective = input.isBase ? own.concat(input.childCookDates) : own;
  const cookCount = own.length;
  const last = lastCook(effective);
  const gapDays = last ? daysBetween(last, now) : null;
  const medianDays = medianIntervalDays(effective);
  const base = { gapDays, medianDays, cookCount };

  if (input.status === 'retired') return { bucket: 'Retired', reason: 'Retired · not suggested, still searchable', ...base };

  if (cooksInLastDays(own, 30, now) >= 3)
    return { bucket: 'Rut', reason: `In a rut · ${cooksInLastDays(own, 30, now)} cooks in 30 days`, ...base };

  if (cookCount === 0 && effective.length === 0) {
    const reason = input.origin === 'expansion' ? 'Never cooked · from your proposals' : 'Never cooked';
    return { bucket: 'New', reason, ...base };
  }

  if (input.tweakAddedAt) return { bucket: 'NeedsWork', reason: 'Tweak added since last cook', ...base };

  if (input.pinned) return { bucket: 'Favourite', reason: 'Pinned · a favourite whatever the numbers say', ...base };

  const forgotten =
    gapDays !== null && (gapDays > input.forgottenDays || (medianDays !== null && medianDays > 0 && gapDays > 2 * medianDays));
  if (forgotten) {
    const usual = medianDays !== null && medianDays > 0 ? `, you usually go ${medianDays}` : '';
    return { bucket: 'Forgotten', reason: `Forgotten — ${gapDays} days${usual}`, ...base };
  }

  if (cookCount >= 6 && distinctMonths(own) >= 6)
    return { bucket: 'Favourite', reason: `Favourite · ${cookCount} cooks over ${spanLabel(own)}`, ...base };

  if (input.baseId !== null) return { bucket: 'Variation', reason: 'A variation you make', ...base };

  const reason = gapDays === null ? 'Not made yet' : gapDays === 0 ? 'Made today' : `Not made in ${gapDays} days`;
  return { bucket: 'Regular', reason, ...base };
}
