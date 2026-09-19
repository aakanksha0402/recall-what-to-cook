import type { Bucket, CookEvent, Dish, DishFacts, DishIngredient, DishVersion, Ingredient, IngredientKind, MealSlot, Settings } from '../domain/types';

// Row shapes as PostgREST returns them (snake_case, timestamps as ISO strings).
export interface DishRow {
  id: number;
  name: string;
  status: Dish['status'];
  form: string | null;
  base_id: number | null;
  is_base: boolean;
  effort: number;
  meal_slots: string;
  pinned: boolean;
  notes: string;
  notes_updated_at: string | null;
  retired_at: string | null;
  origin: Dish['origin'];
  confirmed_at: string | null;
  created_at: string;
}
export interface IngredientRow {
  id: number;
  name: string;
  kind: IngredientKind;
  aliases: unknown;
}
export interface DishIngredientRow {
  dish_id: number;
  ingredient_id: number;
  role: DishIngredient['role'];
}
export interface VersionRow {
  id: number;
  dish_id: number;
  n: number;
  body: string | null;
  tweaks: unknown;
  is_current: boolean;
  created_at: string;
}
export interface CookRow {
  id: number;
  dish_id: number;
  cooked_at: string;
  version_id: number | null;
  meal_slot: MealSlot;
}
export interface TagRow {
  id: number;
  name: string;
}
export interface DishTagRow {
  dish_id: number;
  tag_id: number;
}
export interface SuppressionRow {
  dish_id: number;
  until: string;
}
export interface PantryRow {
  ingredient_id: number;
  state: 'have' | 'low' | 'out';
  updated_at: string;
}
export interface SettingRow {
  key: string;
  value: string;
}

export interface Snapshot {
  dish: DishRow[];
  ingredient: IngredientRow[];
  dish_ingredient: DishIngredientRow[];
  dish_version: VersionRow[];
  cook_event: CookRow[];
  tag: TagRow[];
  dish_tag: DishTagRow[];
  suppression: SuppressionRow[];
  pantry: PantryRow[];
  setting: SettingRow[];
}

export const MAX_BASE_DEPTH = 8;

/** Postgres returns "+00:00" offsets; the engines compare ISO strings, so normalise to "Z". */
export function iso(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Date(t).toISOString();
}

export function jsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function rowToDish(r: DishRow): Dish {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    form: r.form,
    baseId: r.base_id,
    isBase: !!r.is_base,
    effort: (Number(r.effort) || 2) as Dish['effort'],
    mealSlots: r.meal_slots.split(',').filter(Boolean) as MealSlot[],
    pinned: !!r.pinned,
    notes: r.notes ?? '',
    notesUpdatedAt: iso(r.notes_updated_at),
    retiredAt: iso(r.retired_at),
    origin: r.origin,
    confirmedAt: iso(r.confirmed_at),
    createdAt: iso(r.created_at)!,
  };
}

export function rowToIngredient(r: IngredientRow): Ingredient {
  return { id: r.id, name: r.name, kind: r.kind, aliases: jsonArray(r.aliases) };
}

export function rowToVersion(r: VersionRow): DishVersion {
  return { id: r.id, dishId: r.dish_id, n: r.n, body: r.body, tweaks: jsonArray(r.tweaks), isCurrent: !!r.is_current, createdAt: iso(r.created_at)! };
}

export function rowToCook(r: CookRow): CookEvent {
  return { id: r.id, dishId: r.dish_id, cookedAt: iso(r.cooked_at)!, versionId: r.version_id, mealSlot: r.meal_slot };
}

export function settingsFrom(rows: SettingRow[]): Settings {
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, d: number) => Number(m.get(k) ?? d);
  return {
    freshDays: num('fresh_days', 5),
    suppressDays: num('suppress_days', 5),
    forgottenDays: num('forgotten_days', 60),
    weekendRelax: (m.get('weekend_relax') ?? '1') === '1',
  };
}

/** Walk a dish's base chain (self first), capped like the old recursive CTE. */
export function baseChain(dishId: number, byId: Map<number, DishRow>): number[] {
  const chain: number[] = [];
  let cur: number | null = dishId;
  while (cur !== null && chain.length <= MAX_BASE_DEPTH && !chain.includes(cur)) {
    chain.push(cur);
    cur = byId.get(cur)?.base_id ?? null;
  }
  return chain;
}

/** Effective ingredients of a dish: its own, then inherited from each base up the chain. */
export function inheritedIngredients(dishId: number, snap: Pick<Snapshot, 'dish' | 'ingredient' | 'dish_ingredient'>): DishIngredient[] {
  const byId = new Map(snap.dish.map((d) => [d.id, d]));
  const ingById = new Map(snap.ingredient.map((i) => [i.id, i]));
  const linksByDish = new Map<number, DishIngredientRow[]>();
  for (const l of snap.dish_ingredient) {
    const list = linksByDish.get(l.dish_id) ?? [];
    list.push(l);
    linksByDish.set(l.dish_id, list);
  }
  const out: DishIngredient[] = [];
  const seen = new Set<number>();
  baseChain(dishId, byId).forEach((id, depth) => {
    for (const l of (linksByDish.get(id) ?? []).slice().sort((a, b) => (ingById.get(a.ingredient_id)?.name ?? '').localeCompare(ingById.get(b.ingredient_id)?.name ?? ''))) {
      const ing = ingById.get(l.ingredient_id);
      if (!ing || seen.has(ing.id)) continue;
      seen.add(ing.id);
      out.push({ ...rowToIngredient(ing), role: l.role, inherited: depth > 0 });
    }
  });
  return out;
}

export function buildFacts(snap: Snapshot, now = new Date()): Map<number, DishFacts> {
  const facts = new Map<number, DishFacts>();
  const dishes = snap.dish.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (const r of dishes) {
    facts.set(r.id, {
      dish: rowToDish(r),
      cookDates: [],
      childCookDates: [],
      ingredients: inheritedIngredients(r.id, snap),
      tags: [],
      currentVersion: null,
      versionCount: 0,
      suppressedUntil: null,
    });
  }
  const byId = new Map(snap.dish.map((d) => [d.id, d]));
  const cooks = snap.cook_event.map((c) => ({ ...c, at: iso(c.cooked_at)! })).sort((a, b) => a.at.localeCompare(b.at));
  for (const c of cooks) {
    const at = c.at;
    facts.get(c.dish_id)?.cookDates.push(at);
    const baseId = byId.get(c.dish_id)?.base_id;
    if (baseId != null) facts.get(baseId)?.childCookDates.push(at);
  }
  const tagName = new Map(snap.tag.map((t) => [t.id, t.name]));
  for (const dt of snap.dish_tag) {
    const name = tagName.get(dt.tag_id);
    if (name) facts.get(dt.dish_id)?.tags.push(name);
  }
  for (const f of facts.values()) f.tags.sort((a, b) => a.localeCompare(b));
  for (const v of snap.dish_version) {
    const f = facts.get(v.dish_id);
    if (!f) continue;
    f.versionCount++;
    if (v.is_current) f.currentVersion = rowToVersion(v);
  }
  const nowMs = now.getTime();
  for (const s of snap.suppression) {
    const f = facts.get(s.dish_id);
    if (f && Date.parse(s.until) > nowMs) f.suppressedUntil = iso(s.until);
  }
  return facts;
}

export interface TagCount {
  id: number;
  name: string;
  count: number;
}

/** Tag usage across non-retired dishes, most used first. */
export function tagCounts(snap: Pick<Snapshot, 'dish' | 'tag' | 'dish_tag'>): TagCount[] {
  const live = new Set(snap.dish.filter((d) => d.status !== 'retired').map((d) => d.id));
  const counts = new Map<number, number>();
  for (const dt of snap.dish_tag) if (live.has(dt.dish_id)) counts.set(dt.tag_id, (counts.get(dt.tag_id) ?? 0) + 1);
  return snap.tag
    .map((t) => ({ id: t.id, name: t.name, count: counts.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface IngredientUse {
  id: number;
  name: string;
  dishes: number;
}

/** Fresh ingredients by how many non-retired dishes they unlock (through inheritance). */
export function ingredientUse(facts: Map<number, DishFacts>): IngredientUse[] {
  const counts = new Map<number, IngredientUse>();
  for (const f of facts.values()) {
    if (f.dish.status === 'retired') continue;
    for (const i of f.ingredients) {
      if (i.kind !== 'fresh') continue;
      const c = counts.get(i.id) ?? { id: i.id, name: i.name, dishes: 0 };
      c.dishes++;
      counts.set(i.id, c);
    }
  }
  return [...counts.values()].sort((a, b) => b.dishes - a.dishes || a.name.localeCompare(b.name));
}

export type { Bucket };
