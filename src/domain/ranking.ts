import { bucketFor, lastCook, type BucketResult } from './buckets';
import { daysBetween, isWeekend } from './clock';
import type { Bucket, DishFacts, MealSlot, Settings, Suggestion } from './types';

export interface RankContext {
  now: Date;
  slot: MealSlot;
  have: Set<string>; // ingredient names in the pantry
  settings: Settings;
}

export interface Ranked extends Suggestion {
  eligible: boolean;
  why: BucketResult;
}

export function rankOne(f: DishFacts, ctx: RankContext, minutes: number | null = null): Ranked {
  const { dish } = f;
  const tweakAddedAt =
    f.currentVersion && f.currentVersion.n > 1 && (!lastCook(f.cookDates) || f.currentVersion.createdAt > lastCook(f.cookDates)!)
      ? f.currentVersion.createdAt
      : null;
  const why = bucketFor({
    status: dish.status,
    origin: dish.origin,
    pinned: dish.pinned,
    isBase: dish.isBase,
    baseId: dish.baseId,
    cookDates: f.cookDates,
    childCookDates: f.childCookDates,
    tweakAddedAt,
    forgottenDays: ctx.settings.forgottenDays,
    now: ctx.now,
  });

  const freshMatches = f.ingredients.filter((i) => i.kind === 'fresh' && ctx.have.has(i.name)).map((i) => i.name);
  const last = lastCook(f.cookDates);
  const gap = last ? daysBetween(last, ctx.now) : null;

  let eligible = true;
  if (why.bucket === 'Retired' || why.bucket === 'Rut') eligible = false;
  if (gap !== null && gap < ctx.settings.suppressDays) eligible = false;
  if (f.suppressedUntil && Date.parse(f.suppressedUntil) > ctx.now.getTime()) eligible = false;
  if (dish.isBase && f.cookDates.length === 0) eligible = false;

  let score = 0;
  score += Math.min(50, freshMatches.length * 25);
  if (why.medianDays !== null && why.medianDays > 0 && gap !== null) {
    score += clamp(((gap / why.medianDays) - 1) * 15, 0, 30);
  } else if (gap !== null) {
    score += Math.min(20, (gap / 60) * 20);
  } else {
    score += 10;
  }
  const relax = ctx.settings.weekendRelax && isWeekend(ctx.now);
  if (relax) score += 6;
  else score += dish.effort === 1 ? 12 : dish.effort === 2 ? 6 : 0;
  if (dish.mealSlots.includes(ctx.slot)) score += 10;
  if (dish.pinned) score += 8;
  if (why.bucket === 'Forgotten') score += 10;
  if (why.bucket === 'NeedsWork') score += 5;

  const freshNote = freshMatches.length ? ` · ${freshMatches[0]} is fresh` : '';
  return {
    dish,
    bucket: why.bucket,
    reason: why.reason + freshNote,
    meta: metaFor(f, minutes),
    freshMatches,
    score,
    eligible,
    why,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function metaFor(f: DishFacts, minutes: number | null = null): string {
  const names = f.ingredients
    .filter((i) => i.role === 'defining' || i.kind === 'fresh')
    .slice(0, 3)
    .map((i) => i.name);
  const time = minutes ? `${minutes} min` : effortLabel(f.dish.effort);
  const parts = [names.length ? names.map(titleFirst).join(', ') : null, time].filter(Boolean);
  return parts.join(' · ');
}

function titleFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function effortLabel(e: 1 | 2 | 3): string {
  return e === 1 ? 'quick' : e === 2 ? '30–45 min' : 'takes time';
}

export interface HomeSlots {
  lead: Ranked | null;
  alternates: Ranked[];
}

/** Below this many eligible dishes there is nothing to be selective about, so slots top up from any bucket. */
const SMALL_REPERTOIRE = 6;

/** Lead = best score; alternates come from buckets not yet on screen (spec §13). */
export function fillSlots(all: Ranked[]): HomeSlots {
  const pool = all.filter((r) => r.eligible).sort((a, b) => b.score - a.score);
  const lead = pool[0] ?? null;
  if (!lead) return { lead: null, alternates: [] };
  const seen = new Set<Bucket>([lead.bucket]);
  const alternates: Ranked[] = [];
  for (const r of pool.slice(1)) {
    if (seen.has(r.bucket)) continue;
    seen.add(r.bucket);
    alternates.push(r);
    if (alternates.length === 4) break;
  }
  if (alternates.length < 4 && pool.length <= SMALL_REPERTOIRE) {
    for (const r of pool.slice(1)) {
      if (alternates.length === 4) break;
      if (r === lead || alternates.includes(r)) continue;
      alternates.push(r);
    }
  }
  return { lead, alternates };
}
