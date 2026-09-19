import { describe, expect, it } from 'vitest';
import { buildFacts, ingredientUse, iso, tagCounts, type Snapshot } from './facts';

const now = new Date('2026-09-19T18:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const dish = (id: number, name: string, over: Partial<Snapshot['dish'][number]> = {}): Snapshot['dish'][number] => ({
  id,
  name,
  status: 'known',
  form: null,
  base_id: null,
  is_base: false,
  effort: 2,
  meal_slots: 'lunch,dinner',
  pinned: false,
  notes: '',
  notes_updated_at: null,
  retired_at: null,
  origin: 'typed',
  confirmed_at: null,
  created_at: ago(300),
  ...over,
});

const snap: Snapshot = {
  dish: [
    dish(1, 'Onion tomato gravy', { is_base: true }),
    dish(2, 'Mushroom masala', { base_id: 1 }),
    dish(3, 'Paneer gravy', { base_id: 1, status: 'retired' }),
    dish(4, 'Curd rice'),
  ],
  ingredient: [
    { id: 10, name: 'onion', kind: 'staple', aliases: '["pyaz"]' },
    { id: 11, name: 'tomato', kind: 'fresh', aliases: [] },
    { id: 12, name: 'mushroom', kind: 'fresh', aliases: [] },
    { id: 13, name: 'paneer', kind: 'fresh', aliases: [] },
    { id: 14, name: 'curd', kind: 'staple', aliases: [] },
  ],
  dish_ingredient: [
    { dish_id: 1, ingredient_id: 10, role: 'defining' },
    { dish_id: 1, ingredient_id: 11, role: 'defining' },
    { dish_id: 2, ingredient_id: 12, role: 'defining' },
    { dish_id: 2, ingredient_id: 11, role: 'optional' }, // own link wins over inherited
    { dish_id: 3, ingredient_id: 13, role: 'defining' },
    { dish_id: 4, ingredient_id: 14, role: 'defining' },
  ],
  dish_version: [
    { id: 100, dish_id: 2, n: 1, body: null, tweaks: [], is_current: false, created_at: ago(200) },
    { id: 101, dish_id: 2, n: 2, body: null, tweaks: '["less chilli"]', is_current: true, created_at: ago(3) },
  ],
  cook_event: [
    { id: 1000, dish_id: 2, cooked_at: '2026-09-10T12:00:00+00:00', version_id: 100, meal_slot: 'dinner' },
    { id: 1001, dish_id: 2, cooked_at: ago(40), version_id: null, meal_slot: 'lunch' },
    { id: 1002, dish_id: 1, cooked_at: ago(90), version_id: null, meal_slot: 'dinner' },
  ],
  tag: [
    { id: 50, name: 'north' },
    { id: 51, name: 'base' },
  ],
  dish_tag: [
    { dish_id: 2, tag_id: 50 },
    { dish_id: 3, tag_id: 50 },
    { dish_id: 1, tag_id: 51 },
  ],
  suppression: [
    { dish_id: 4, until: ago(-3) },
    { dish_id: 2, until: ago(1) },
  ],
  pantry: [],
  setting: [],
};

describe('buildFacts', () => {
  const facts = buildFacts(snap, now);
  it('inherits ingredients through the base chain and marks them', () => {
    const m = facts.get(2)!;
    expect(m.ingredients.map((i) => `${i.name}${i.inherited ? '*' : ''}`)).toEqual(['mushroom', 'tomato', 'onion*']);
    expect(m.ingredients.find((i) => i.name === 'tomato')?.role).toBe('optional');
  });
  it('gives a base its children cook dates', () => {
    const base = facts.get(1)!;
    expect(base.cookDates).toHaveLength(1);
    expect(base.childCookDates).toHaveLength(2);
  });
  it('normalises timestamps and sorts cook dates', () => {
    const m = facts.get(2)!;
    expect(m.cookDates).toEqual([ago(40), '2026-09-10T12:00:00.000Z']);
  });
  it('picks the current version and counts all', () => {
    const m = facts.get(2)!;
    expect(m.versionCount).toBe(2);
    expect(m.currentVersion?.tweaks).toEqual(['less chilli']);
  });
  it('keeps only live suppressions', () => {
    expect(facts.get(4)!.suppressedUntil).not.toBeNull();
    expect(facts.get(2)!.suppressedUntil).toBeNull();
  });
  it('sorts dishes by name and attaches tags', () => {
    expect([...facts.values()].map((f) => f.dish.name)).toEqual(['Curd rice', 'Mushroom masala', 'Onion tomato gravy', 'Paneer gravy']);
    expect(facts.get(2)!.tags).toEqual(['north']);
  });
});

describe('derived counts', () => {
  it('tag counts skip retired dishes', () => {
    expect(tagCounts(snap)).toEqual([
      { id: 51, name: 'base', count: 1 },
      { id: 50, name: 'north', count: 1 },
    ]);
  });
  it('ingredient use counts fresh ingredients through inheritance, skipping retired', () => {
    const use = ingredientUse(buildFacts(snap, now));
    expect(use.map((u) => `${u.name}:${u.dishes}`)).toEqual(['tomato:2', 'mushroom:1']);
  });
  it('iso tolerates nulls', () => {
    expect(iso(null)).toBeNull();
    expect(iso('2026-01-01T00:00:00+05:30')).toBe('2025-12-31T18:30:00.000Z');
  });
});
