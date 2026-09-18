import { describe, expect, it } from 'vitest';
import { fillSlots, rankOne, type RankContext } from './ranking';
import type { Dish, DishFacts } from './types';

const now = new Date('2026-09-03T19:00:00'); // a Thursday
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

let nextId = 1;
function facts(over: Partial<Dish> & { cooks?: number[]; fresh?: string[]; suppressedUntil?: string | null; childCooks?: number[] }): DishFacts {
  const id = nextId++;
  const dish: Dish = {
    id,
    name: `Dish ${id}`,
    status: 'known',
    form: null,
    baseId: null,
    isBase: false,
    effort: 2,
    mealSlots: ['lunch', 'dinner'],
    pinned: false,
    notes: '',
    notesUpdatedAt: null,
    retiredAt: null,
    origin: 'typed',
    confirmedAt: null,
    createdAt: ago(400),
    ...over,
  };
  return {
    dish,
    cookDates: (over.cooks ?? []).map(ago),
    childCookDates: (over.childCooks ?? []).map(ago),
    ingredients: (over.fresh ?? []).map((n, i) => ({ id: i, name: n, kind: 'fresh', aliases: [], role: 'defining', inherited: false })),
    tags: [],
    currentVersion: null,
    versionCount: 1,
    suppressedUntil: over.suppressedUntil ?? null,
  };
}

const ctx: RankContext = {
  now,
  slot: 'dinner',
  have: new Set(['tomato', 'methi']),
  settings: { freshDays: 5, suppressDays: 5, forgottenDays: 60, weekendRelax: true },
};

describe('rankOne', () => {
  it('excludes recent cooks, ruts, retired, suppressed and cook-less bases', () => {
    expect(rankOne(facts({ cooks: [2] }), ctx).eligible).toBe(false);
    expect(rankOne(facts({ cooks: [6, 12, 20] }), ctx).eligible).toBe(false);
    expect(rankOne(facts({ status: 'retired', cooks: [40] }), ctx).eligible).toBe(false);
    expect(rankOne(facts({ cooks: [40], suppressedUntil: ago(-3) }), ctx).eligible).toBe(false);
    expect(rankOne(facts({ isBase: true, childCooks: [10] }), ctx).eligible).toBe(false);
    expect(rankOne(facts({ isBase: true, cooks: [90], childCooks: [10] }), ctx).eligible).toBe(true);
  });
  it('fresh match is the strongest term', () => {
    const withFresh = rankOne(facts({ cooks: [20], fresh: ['tomato'] }), ctx);
    const without = rankOne(facts({ cooks: [20], fresh: ['paneer'] }), ctx);
    expect(withFresh.score).toBeGreaterThan(without.score + 20);
    expect(withFresh.reason).toContain('tomato is fresh');
  });
  it('quick dishes score higher on weekdays', () => {
    const quick = rankOne(facts({ cooks: [20], effort: 1 }), ctx);
    const slow = rankOne(facts({ cooks: [20], effort: 3 }), ctx);
    expect(quick.score).toBeGreaterThan(slow.score);
    const weekend = { ...ctx, now: new Date('2026-09-05T19:00:00') };
    expect(rankOne(facts({ cooks: [20], effort: 1 }), weekend).score).toBe(rankOne(facts({ cooks: [20], effort: 3 }), weekend).score);
  });
});

describe('fillSlots', () => {
  it('fills alternates from distinct buckets first', () => {
    const all = [
      facts({ cooks: [70, 100], fresh: ['methi'] }), // Forgotten + fresh → lead
      facts({ cooks: [65, 95] }), // Forgotten
      facts({ cooks: [20] }), // Regular
      facts({ cooks: [25] }), // Regular
      facts({}), // New
      facts({ pinned: true, cooks: [30] }), // Favourite
      facts({ cooks: [8, 40, 70, 100, 130, 160, 190] }), // Favourite by spread
    ].map((f) => rankOne(f, ctx));
    const { lead, alternates } = fillSlots(all);
    expect(lead?.bucket).toBe('Forgotten');
    const buckets = alternates.map((a) => a.bucket);
    expect(new Set(buckets).size).toBe(buckets.length);
    expect(buckets).not.toContain('Forgotten');
    expect(alternates).toHaveLength(3);
  });
  it('tops up from any bucket when there are too few buckets', () => {
    const all = [facts({ cooks: [20] }), facts({ cooks: [22] }), facts({ cooks: [24] })].map((f) => rankOne(f, ctx));
    const { alternates } = fillSlots(all);
    expect(alternates).toHaveLength(2);
  });
});
