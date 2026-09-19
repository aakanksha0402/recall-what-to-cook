import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultBaseName, suggestBases, type BaseCandidate, type BaseProposal } from '../domain/baseSuggest';
import { bucketFor, lastCook, type BucketResult } from '../domain/buckets';
import { addDays, mealSlotFor, nowIso, startOfMonthIso } from '../domain/clock';
import { generateProposals, proposalKey, type Plausibility, type Proposal } from '../domain/expansion';
import { normaliseWord, parseDishName, titleCase, type LexIndex } from '../domain/lexicon';
import { fillSlots, rankOne, type HomeSlots, type Ranked } from '../domain/ranking';
import { search as runSearch, type SearchDoc } from '../domain/search';
import type { CookEvent, Dish, DishFacts, DishVersion, Ingredient, IngredientKind, MealSlot, Settings, Tag } from '../domain/types';
import {
  buildFacts,
  ingredientUse,
  jsonArray,
  rowToCook,
  rowToDish,
  rowToIngredient,
  rowToVersion,
  settingsFrom,
  tagCounts,
  type DishRow,
  type IngredientRow,
  type Snapshot,
  type VersionRow,
} from './facts';

export interface Chip {
  id: number;
  name: string;
  have: boolean;
  dishes: number;
}

export interface HomeView extends HomeSlots {
  chips: Chip[];
  nextUp: Dish | null;
  slot: MealSlot;
}

export interface CookReceipt {
  eventId: number;
  dish: Dish;
  clearedNextUp: boolean;
}

export interface DetailView {
  facts: DishFacts;
  why: BucketResult;
  base: Dish | null;
  siblings: Dish[];
  children: Dish[];
  versions: DishVersion[];
  history: CookEvent[];
  formLabel: string | null;
  minutes: number | null;
}

const NOT_TONIGHT_DAYS = 7;
const PAGE = 1000;
const TABLES: (keyof Snapshot)[] = ['dish', 'ingredient', 'dish_ingredient', 'dish_version', 'cook_event', 'tag', 'dish_tag', 'suppression', 'pantry', 'setting'];

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Right after sign-in, Supabase's auth node can stamp a token a second ahead of its API
 * node's clock, which then rejects it as "JWT issued at future". It clears itself within
 * seconds, so transient auth rejections are retried with a short pause.
 */
async function withRetry<T>(fn: () => Promise<T>, what: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/issued at future|jwt|401/i.test(msg)) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`${what}: still failing after retries — ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/**
 * The one data-access module. Every screen talks to this; it talks to Supabase.
 * Reads come from one cached snapshot of the user's rows (invalidated on every write)
 * and are assembled in memory — the data is tiny.
 */
export class Repo {
  private listeners = new Set<() => void>();
  private snapshot: Promise<Snapshot> | null = null;

  constructor(
    readonly sb: SupabaseClient,
    readonly lex: LexIndex,
    readonly plaus: Plausibility,
  ) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.snapshot = null;
    for (const fn of this.listeners) fn();
  }

  // ── loading ─────────────────────────────────────────────────────────────

  private async fetchAll<T>(table: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = must(await this.sb.from(table).select('*').range(from, from + PAGE - 1), `load ${table}`) as T[];
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }

  private snap(): Promise<Snapshot> {
    if (!this.snapshot) {
      this.snapshot = withRetry(async () => {
        const rows = await Promise.all(TABLES.map((t) => this.fetchAll<unknown>(t)));
        return Object.fromEntries(TABLES.map((t, i) => [t, rows[i]])) as unknown as Snapshot;
      }, 'load').catch((e) => {
        this.snapshot = null;
        throw e;
      });
    }
    return this.snapshot;
  }

  async loadFacts(now = new Date()): Promise<Map<number, DishFacts>> {
    return buildFacts(await this.snap(), now);
  }

  // ── boot ────────────────────────────────────────────────────────────────

  async boot(): Promise<void> {
    await this.seedIngredients();
    await this.decayPantry();
  }

  private async seedIngredients(): Promise<void> {
    const version = String(this.lex.ingredients.length);
    if ((await this.setting('lexicon_version')) === version) return;
    const rows = this.lex.ingredients.map((i) => ({ name: i.name, kind: i.kind, aliases: i.aliases }));
    await withRetry(async () => must(await this.sb.from('ingredient').upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true }), 'seed ingredients'), 'seed');
    await this.setSetting('lexicon_version', version);
  }

  // ── settings ────────────────────────────────────────────────────────────

  async settings(): Promise<Settings> {
    return settingsFrom((await this.snap()).setting);
  }

  async setting(key: string): Promise<string | null> {
    return (await this.snap()).setting.find((s) => s.key === key)?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    must(await this.sb.from('setting').upsert({ key, value }, { onConflict: 'user_id,key' }), 'save setting');
    this.changed();
  }

  async why(f: DishFacts, now = new Date()): Promise<BucketResult> {
    return whyFor(f, await this.settings(), now);
  }

  // ── home ────────────────────────────────────────────────────────────────

  async home(now = new Date(), slotOverride?: MealSlot): Promise<HomeView> {
    const snap = await this.snap();
    const facts = buildFacts(snap, now);
    const settings = settingsFrom(snap.setting);
    const have = await this.pantryHave();
    const nextUp = await this.nextUpDish();
    const slot = slotOverride ?? mealSlotFor(now);
    const haveNames = new Set(have.map((h) => h.name));
    const ranked: Ranked[] = [];
    for (const f of facts.values()) ranked.push(rankOne(f, { now, slot, have: haveNames, settings }, this.minutesFor(f.dish.form)));
    const slots = fillSlots(ranked);
    return { ...slots, chips: this.chips(facts, have), nextUp, slot };
  }

  private minutesFor(form: string | null): number | null {
    return form ? (this.lex.formByAlias.get(normaliseWord(form))?.minutes ?? null) : null;
  }

  private chips(facts: Map<number, DishFacts>, have: Ingredient[]): Chip[] {
    const haveIds = new Set(have.map((h) => h.id));
    const use = ingredientUse(facts);
    const byId = new Map(use.map((u) => [u.id, u]));
    for (const h of have) if (!byId.has(h.id)) byId.set(h.id, { id: h.id, name: h.name, dishes: 0 });
    return [...byId.values()]
      .map((u) => ({ id: u.id, name: u.name, have: haveIds.has(u.id), dishes: u.dishes }))
      .sort((a, b) => Number(b.have) - Number(a.have) || b.dishes - a.dishes || a.name.localeCompare(b.name))
      .slice(0, 12);
  }

  // ── pantry & ingredients ────────────────────────────────────────────────

  async pantryHave(): Promise<Ingredient[]> {
    const snap = await this.snap();
    const have = new Set(snap.pantry.filter((p) => p.state === 'have').map((p) => p.ingredient_id));
    return snap.ingredient
      .filter((i) => have.has(i.id))
      .map(rowToIngredient)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async togglePantry(ingredientId: number): Promise<void> {
    const snap = await this.snap();
    if (snap.pantry.some((p) => p.ingredient_id === ingredientId)) {
      must(await this.sb.from('pantry').delete().eq('ingredient_id', ingredientId), 'pantry');
    } else {
      must(await this.sb.from('pantry').insert({ ingredient_id: ingredientId, state: 'have', updated_at: nowIso() }), 'pantry');
    }
    this.changed();
  }

  private async decayPantry(): Promise<void> {
    const { freshDays } = await this.settings();
    const cutoff = addDays(new Date(), -freshDays).toISOString();
    const stale = (await this.snap()).pantry.filter((p) => p.updated_at < cutoff);
    if (!stale.length) return;
    must(await this.sb.from('pantry').delete().lt('updated_at', cutoff), 'pantry decay');
    this.changed();
  }

  async freshIngredients(): Promise<Ingredient[]> {
    return (await this.snap()).ingredient
      .filter((i) => i.kind === 'fresh')
      .map(rowToIngredient)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async staples(): Promise<Ingredient[]> {
    return (await this.snap()).ingredient
      .filter((i) => i.kind === 'staple')
      .map(rowToIngredient)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async setIngredientKind(id: number, kind: IngredientKind): Promise<void> {
    must(await this.sb.from('ingredient').update({ kind }).eq('id', id), 'ingredient kind');
    this.changed();
  }

  async ensureIngredient(name: string, kind: IngredientKind = 'fresh'): Promise<Ingredient> {
    const clean = name.trim().toLowerCase();
    const existing = (await this.snap()).ingredient.find((i) => i.name.toLowerCase() === clean);
    if (existing) return rowToIngredient(existing);
    const row = must(await this.sb.from('ingredient').insert({ name: clean, kind, aliases: [] }).select('*').single(), 'add ingredient') as IngredientRow;
    this.changed();
    return rowToIngredient(row);
  }

  /** Ingredient chip row on Dishes — ordered by how many dishes each one unlocks. */
  async ingredientRow(): Promise<Chip[]> {
    const facts = await this.loadFacts();
    const have = new Set((await this.pantryHave()).map((h) => h.id));
    return ingredientUse(facts).map((u) => ({ id: u.id, name: u.name, have: have.has(u.id), dishes: u.dishes }));
  }

  // ── dishes ──────────────────────────────────────────────────────────────

  async dish(id: number): Promise<Dish | null> {
    const r = (await this.snap()).dish.find((d) => d.id === id);
    return r ? rowToDish(r) : null;
  }

  async findDishByName(name: string): Promise<Dish | null> {
    const clean = name.trim().toLowerCase();
    const r = (await this.snap()).dish.find((d) => d.name.toLowerCase() === clean);
    return r ? rowToDish(r) : null;
  }

  async dishCount(): Promise<number> {
    return (await this.snap()).dish.filter((d) => d.status !== 'retired').length;
  }

  /** Batch entry: one dish per line, ingredients and tags from the name. Returns ids (existing ones reused). */
  async createFromLines(lines: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const parsed = parseDishName(raw, this.lex);
      if (!parsed.name) continue;
      const existing = await this.findDishByName(parsed.name);
      if (existing) {
        ids.push(existing.id);
        for (const t of parsed.tags) await this.addTag(existing.id, t);
        continue;
      }
      const id = await this.insertDish({
        name: parsed.name,
        status: 'known',
        form: parsed.form?.name ?? null,
        effort: parsed.effort,
        mealSlots: parsed.mealSlots,
        origin: 'typed',
        confirmed: true,
        ingredientNames: parsed.ingredients.map((i) => i.name),
      });
      for (const t of parsed.tags) await this.addTag(id, t);
      ids.push(id);
    }
    this.changed();
    return ids;
  }

  private async insertDish(d: {
    name: string;
    status: 'known' | 'idea';
    form: string | null;
    effort: number;
    mealSlots: MealSlot[];
    origin: Dish['origin'];
    confirmed: boolean;
    ingredientNames: string[];
    baseId?: number | null;
    isBase?: boolean;
  }): Promise<number> {
    const now = nowIso();
    const row = must(
      await this.sb
        .from('dish')
        .insert({
          name: d.name,
          status: d.status,
          form: d.form,
          base_id: d.baseId ?? null,
          is_base: !!d.isBase,
          effort: d.effort,
          meal_slots: d.mealSlots.join(','),
          origin: d.origin,
          confirmed_at: d.confirmed ? now : null,
          created_at: now,
        })
        .select('id')
        .single(),
      'add dish',
    ) as { id: number };
    const id = row.id;
    must(await this.sb.from('dish_version').insert({ dish_id: id, n: 1, tweaks: [], is_current: true, created_at: now }), 'add version');
    await this.linkIngredients(id, d.ingredientNames, d.origin);
    this.changed();
    return id;
  }

  private async linkIngredients(dishId: number, names: string[], origin = 'typed'): Promise<void> {
    const links: { dish_id: number; ingredient_id: number; role: string; origin: string; confirmed: boolean }[] = [];
    for (const raw of names) {
      const name = raw.trim().toLowerCase();
      if (!name) continue;
      const ing = await this.ensureIngredient(name);
      links.push({ dish_id: dishId, ingredient_id: ing.id, role: 'defining', origin, confirmed: true });
    }
    if (links.length) must(await this.sb.from('dish_ingredient').upsert(links, { onConflict: 'dish_id,ingredient_id', ignoreDuplicates: true }), 'link ingredients');
  }

  private async updateDish(id: number, patch: Partial<DishRow>): Promise<void> {
    must(await this.sb.from('dish').update(patch).eq('id', id), 'update dish');
    this.changed();
  }

  async setPinned(id: number, pinned: boolean): Promise<void> {
    await this.updateDish(id, { pinned });
  }

  async pinnedCount(): Promise<number> {
    return (await this.snap()).dish.filter((d) => d.pinned && d.status !== 'retired').length;
  }

  async retire(id: number): Promise<void> {
    must(await this.sb.from('next_up').delete().eq('dish_id', id), 'next up');
    await this.updateDish(id, { status: 'retired', retired_at: nowIso() });
  }

  async bringBack(id: number): Promise<void> {
    await this.updateDish(id, { status: 'known', retired_at: null });
  }

  async updateNotes(id: number, notes: string): Promise<void> {
    await this.updateDish(id, { notes, notes_updated_at: nowIso() });
  }

  async rename(id: number, name: string): Promise<void> {
    await this.updateDish(id, { name: name.trim() });
  }

  async setEffort(id: number, effort: 1 | 2 | 3): Promise<void> {
    await this.updateDish(id, { effort });
  }

  private currentVersionRow(snap: Snapshot, dishId: number): VersionRow | undefined {
    return snap.dish_version.find((v) => v.dish_id === dishId && v.is_current);
  }

  private async newVersion(dishId: number, tweaks: string[], body: string | null, createdAt = nowIso()): Promise<DishVersion> {
    const snap = await this.snap();
    const cur = this.currentVersionRow(snap, dishId);
    const n = snap.dish_version.filter((v) => v.dish_id === dishId).reduce((m, v) => Math.max(m, v.n), 0) + 1;
    if (cur) must(await this.sb.from('dish_version').update({ is_current: false }).eq('dish_id', dishId), 'versions');
    const row = must(
      await this.sb.from('dish_version').insert({ dish_id: dishId, n, body, tweaks, is_current: true, created_at: createdAt }).select('*').single(),
      'add version',
    ) as VersionRow;
    this.changed();
    return rowToVersion(row);
  }

  /** "Note a tweak": one line → a new current version carrying every earlier line plus this one. */
  async addTweak(id: number, line: string): Promise<DishVersion> {
    const cur = this.currentVersionRow(await this.snap(), id);
    return this.newVersion(id, jsonArray(cur?.tweaks).concat([line.trim()]), cur?.body ?? null);
  }

  async removeTweak(id: number, index: number): Promise<void> {
    const cur = this.currentVersionRow(await this.snap(), id);
    if (!cur) return;
    const tweaks = jsonArray(cur.tweaks);
    tweaks.splice(index, 1);
    await this.newVersion(id, tweaks, cur.body);
  }

  async versions(id: number): Promise<DishVersion[]> {
    return (await this.snap()).dish_version
      .filter((v) => v.dish_id === id)
      .map(rowToVersion)
      .sort((a, b) => b.n - a.n);
  }

  async cookHistory(id: number): Promise<CookEvent[]> {
    return (await this.snap()).cook_event
      .filter((c) => c.dish_id === id)
      .map(rowToCook)
      .sort((a, b) => b.cookedAt.localeCompare(a.cookedAt));
  }

  async setIngredients(id: number, names: string[]): Promise<void> {
    must(await this.sb.from('dish_ingredient').delete().eq('dish_id', id), 'ingredients');
    await this.linkIngredients(id, names);
    this.changed();
  }

  async detail(id: number, now = new Date()): Promise<DetailView | null> {
    const snap = await this.snap();
    const facts = buildFacts(snap, now);
    const f = facts.get(id);
    if (!f) return null;
    const why = whyFor(f, settingsFrom(snap.setting), now);
    const base = f.dish.baseId !== null ? (facts.get(f.dish.baseId)?.dish ?? null) : null;
    const siblings = base ? [...facts.values()].filter((x) => x.dish.baseId === base.id && x.dish.id !== id).map((x) => x.dish) : [];
    const children = [...facts.values()].filter((x) => x.dish.baseId === id).map((x) => x.dish);
    const form = f.dish.form ? this.lex.formByAlias.get(normaliseWord(f.dish.form)) : undefined;
    const [versions, history] = await Promise.all([this.versions(id), this.cookHistory(id)]);
    return { facts: f, why, base, siblings, children, versions, history, formLabel: form?.label ?? null, minutes: form?.minutes ?? null };
  }

  // ── tags ────────────────────────────────────────────────────────────────

  async tags(): Promise<Tag[]> {
    return tagCounts(await this.snap());
  }

  async addTag(dishId: number, name: string): Promise<void> {
    const clean = name.trim().replace(/^#/, '').toLowerCase();
    if (!clean) return;
    const snap = await this.snap();
    let tag = snap.tag.find((t) => t.name.toLowerCase() === clean);
    if (!tag) {
      tag = must(await this.sb.from('tag').insert({ name: clean }).select('id, name').single(), 'add tag') as { id: number; name: string };
    }
    must(await this.sb.from('dish_tag').upsert({ dish_id: dishId, tag_id: tag.id }, { onConflict: 'dish_id,tag_id', ignoreDuplicates: true }), 'tag dish');
    this.changed();
  }

  async removeTag(dishId: number, name: string): Promise<void> {
    const snap = await this.snap();
    const tag = snap.tag.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tag) return;
    must(await this.sb.from('dish_tag').delete().eq('dish_id', dishId).eq('tag_id', tag.id), 'untag');
    const stillUsed = snap.dish_tag.some((dt) => dt.tag_id === tag.id && dt.dish_id !== dishId);
    if (!stillUsed) must(await this.sb.from('tag').delete().eq('id', tag.id), 'drop tag');
    this.changed();
  }

  // ── cook / undo / next up / not tonight ─────────────────────────────────

  async cook(dishId: number, now = new Date()): Promise<CookReceipt> {
    const receipt = await this.logCookAt(dishId, now.toISOString());
    const nu = (await this.snap()).dish; // snapshot already invalidated by logCookAt; re-read next up below
    void nu;
    return receipt;
  }

  /** Records a cook at a given time; clears Next up and any Not-tonight suppression for the dish. */
  async logCookAt(dishId: number, at: string): Promise<CookReceipt> {
    const snap = await this.snap();
    const dish = rowToDish(snap.dish.find((d) => d.id === dishId)!);
    const version = this.currentVersionRow(snap, dishId);
    const ev = must(
      await this.sb
        .from('cook_event')
        .insert({ dish_id: dishId, cooked_at: at, version_id: version?.id ?? null, meal_slot: mealSlotFor(new Date(at)) })
        .select('id')
        .single(),
      'log cook',
    ) as { id: number };
    const current = await this.nextUpDish();
    const clearedNextUp = current?.id === dishId;
    if (clearedNextUp) must(await this.sb.from('next_up').delete().eq('dish_id', dishId), 'next up');
    if (snap.suppression.some((s) => s.dish_id === dishId)) must(await this.sb.from('suppression').delete().eq('dish_id', dishId), 'suppression');
    this.changed();
    return { eventId: ev.id, dish, clearedNextUp };
  }

  async undoCook(receipt: CookReceipt): Promise<void> {
    must(await this.sb.from('cook_event').delete().eq('id', receipt.eventId), 'undo');
    if (receipt.clearedNextUp) await this.setNextUp(receipt.dish.id);
    this.changed();
  }

  async nextUpDish(): Promise<Dish | null> {
    const res = await this.sb.from('next_up').select('dish_id').maybeSingle();
    const row = must(res, 'next up') as { dish_id: number } | null;
    return row ? this.dish(row.dish_id) : null;
  }

  async setNextUp(dishId: number): Promise<void> {
    must(await this.sb.from('next_up').upsert({ dish_id: dishId, set_at: nowIso() }, { onConflict: 'user_id' }), 'set next up');
    this.changed();
  }

  async clearNextUp(): Promise<void> {
    must(await this.sb.from('next_up').delete().gte('dish_id', 0), 'clear next up');
    this.changed();
  }

  async notTonight(dishId: number, now = new Date()): Promise<void> {
    must(await this.sb.from('suppression').upsert({ dish_id: dishId, until: addDays(now, NOT_TONIGHT_DAYS).toISOString() }, { onConflict: 'dish_id' }), 'not tonight');
    this.changed();
  }

  // ── bases and variations ────────────────────────────────────────────────

  async markBase(id: number, isBase: boolean): Promise<void> {
    await this.updateDish(id, { is_base: isBase });
  }

  /** Link to a base; unlinking copies the inherited ingredients down first so nothing is lost. */
  async setBase(id: number, baseId: number | null): Promise<void> {
    if (baseId === id) return;
    if (baseId === null) {
      const facts = await this.loadFacts();
      const inherited = facts.get(id)?.ingredients.filter((i) => i.inherited) ?? [];
      if (inherited.length) {
        must(
          await this.sb
            .from('dish_ingredient')
            .upsert(
              inherited.map((i) => ({ dish_id: id, ingredient_id: i.id, role: i.role, origin: 'typed', confirmed: true })),
              { onConflict: 'dish_id,ingredient_id', ignoreDuplicates: true },
            ),
          'copy ingredients',
        );
      }
    } else {
      must(await this.sb.from('dish').update({ is_base: true }).eq('id', baseId), 'mark base');
    }
    await this.updateDish(id, { base_id: baseId });
  }

  /** On a base: type only the addition ("mushroom") → "Mushroom gravy" linked to it. */
  async addVariation(baseId: number, addition: string): Promise<number> {
    const base = (await this.dish(baseId))!;
    const parsed = parseDishName(addition, this.lex);
    const formWord = base.form ?? base.name.trim().split(/\s+/).pop()!.toLowerCase();
    const name = `${titleCase(parsed.name.toLowerCase())} ${formWord}`;
    const existing = await this.findDishByName(name);
    if (existing) {
      await this.setBase(existing.id, baseId);
      return existing.id;
    }
    const ingredientNames = parsed.ingredients.length ? parsed.ingredients.map((i) => i.name) : [parsed.name.toLowerCase()];
    const id = await this.insertDish({
      name,
      status: 'known',
      form: base.form,
      effort: base.effort,
      mealSlots: base.mealSlots,
      origin: 'typed',
      confirmed: true,
      ingredientNames,
      baseId,
    });
    if (!base.isBase) await this.updateDish(baseId, { is_base: true });
    return id;
  }

  async baseSuggestions(): Promise<BaseProposal[]> {
    const snap = await this.snap();
    const ingName = new Map(snap.ingredient.map((i) => [i.id, i.name]));
    const candidates: BaseCandidate[] = snap.dish
      .filter((d) => d.status === 'known')
      .map((d) => ({
        id: d.id,
        name: d.name,
        form: d.form,
        baseId: d.base_id,
        isBase: !!d.is_base,
        definingIngredients: snap.dish_ingredient
          .filter((l) => l.dish_id === d.id && l.role === 'defining')
          .map((l) => ingName.get(l.ingredient_id))
          .filter((n): n is string => !!n),
      }));
    return suggestBases(candidates);
  }

  async acceptBaseSuggestion(p: BaseProposal, name = defaultBaseName(p)): Promise<number> {
    const first = (await this.dish(p.children[0]!.id))!;
    const baseId = await this.insertDish({
      name,
      status: 'known',
      form: p.form,
      effort: first.effort,
      mealSlots: first.mealSlots,
      origin: 'typed',
      confirmed: true,
      ingredientNames: p.sharedIngredients,
      isBase: true,
    });
    const snap = await this.snap();
    const sharedIds = snap.ingredient.filter((i) => p.sharedIngredients.includes(i.name.toLowerCase())).map((i) => i.id);
    for (const c of p.children) {
      must(await this.sb.from('dish').update({ base_id: baseId }).eq('id', c.id), 'link child');
      if (sharedIds.length) must(await this.sb.from('dish_ingredient').delete().eq('dish_id', c.id).in('ingredient_id', sharedIds), 'strip inherited');
    }
    this.changed();
    return baseId;
  }

  // ── expansion proposals ─────────────────────────────────────────────────

  async proposals(n = 10): Promise<{ proposals: Proposal[]; answered: number }> {
    const snap = await this.snap();
    const refused = must(await this.sb.from('proposal_answer').select('dish_key'), 'proposal answers') as { dish_key: string }[];
    const live = snap.dish.filter((d) => d.status !== 'retired');
    const ingName = new Map(snap.ingredient.map((i) => [i.id, i.name]));
    const ingCount = new Map<string, number>();
    for (const l of snap.dish_ingredient) {
      if (!live.some((d) => d.id === l.dish_id)) continue;
      const name = ingName.get(l.ingredient_id);
      if (name) ingCount.set(name, (ingCount.get(name) ?? 0) + 1);
    }
    const formCount = new Map<string, number>();
    for (const d of live) if (d.form) formCount.set(d.form, (formCount.get(d.form) ?? 0) + 1);
    const byCount = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
    const input = {
      lex: this.lex,
      plaus: this.plaus,
      existing: new Set(snap.dish.map((d) => proposalKey(d.name))),
      refused: new Set(refused.map((r) => r.dish_key)),
      bases: live.filter((d) => d.is_base).map((b) => ({ id: b.id, name: b.name, form: b.form })),
      usedIngredients: byCount(ingCount),
      usedForms: byCount(formCount),
    };
    const out: Proposal[] = [];
    for (const p of generateProposals(input)) {
      out.push(p);
      if (out.length >= n) break;
    }
    return { proposals: out, answered: Number((await this.setting('proposals_answered')) ?? 0) };
  }

  async answerProposal(p: Proposal, answer: 'yes' | 'never' | 'no'): Promise<void> {
    if (answer === 'no') {
      must(await this.sb.from('proposal_answer').upsert({ dish_key: p.key, answer: 'no', answered_at: nowIso() }, { onConflict: 'user_id,dish_key' }), 'refuse proposal');
    } else {
      const form = p.form ? this.lex.formByAlias.get(normaliseWord(p.form)) : undefined;
      await this.insertDish({
        name: p.name,
        status: answer === 'yes' ? 'known' : 'idea',
        form: p.form,
        effort: form?.effort ?? 2,
        mealSlots: form?.mealSlots ?? ['lunch', 'dinner'],
        origin: 'expansion',
        confirmed: answer === 'yes',
        ingredientNames: p.ingredients,
        baseId: p.baseId,
      });
    }
    const answered = Number((await this.setting('proposals_answered')) ?? 0) + 1;
    await this.setSetting('proposals_answered', String(answered));
  }

  // ── search / stats ──────────────────────────────────────────────────────

  async search(query: string, excludeIngredients: string[] = [], now = new Date()) {
    const snap = await this.snap();
    const facts = buildFacts(snap, now);
    const tweakLines = new Map<number, string[]>();
    for (const v of snap.dish_version) {
      const list = tweakLines.get(v.dish_id) ?? [];
      for (const line of jsonArray(v.tweaks)) if (!list.includes(line)) list.push(line);
      tweakLines.set(v.dish_id, list);
    }
    const docs: SearchDoc<DishFacts>[] = [...facts.values()].map((f) => ({
      item: f,
      name: f.dish.name,
      ingredients: f.ingredients.map((i) => i.name),
      tags: f.tags,
      notes: f.dish.notes,
      tweakLines: tweakLines.get(f.dish.id) ?? [],
    }));
    return runSearch(query, docs, excludeIngredients);
  }

  async scoreboard(now = new Date()): Promise<{ cooked: number; known: number }> {
    const snap = await this.snap();
    const since = startOfMonthIso(now);
    const live = new Set(snap.dish.filter((d) => d.status !== 'retired').map((d) => d.id));
    const cooked = new Set(snap.cook_event.filter((c) => live.has(c.dish_id) && new Date(c.cooked_at).toISOString() >= since).map((c) => c.dish_id)).size;
    return { cooked, known: snap.dish.filter((d) => d.status === 'known').length };
  }

  async totals(): Promise<{ dishes: number; cooks: number }> {
    const snap = await this.snap();
    return { dishes: snap.dish.length, cooks: snap.cook_event.length };
  }

  // ── dev-only helpers used by the demo seed ──────────────────────────────

  async backdateVersions(dishId: number, createdAt: string): Promise<void> {
    must(await this.sb.from('dish_version').update({ created_at: createdAt }).eq('dish_id', dishId), 'backdate');
    this.changed();
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

export function whyFor(f: DishFacts, settings: Settings, now: Date): BucketResult {
  const last = lastCook(f.cookDates);
  const tweakAddedAt = f.currentVersion && f.currentVersion.n > 1 && (!last || f.currentVersion.createdAt > last) ? f.currentVersion.createdAt : null;
  return bucketFor({
    status: f.dish.status,
    origin: f.dish.origin,
    pinned: f.dish.pinned,
    isBase: f.dish.isBase,
    baseId: f.dish.baseId,
    cookDates: f.cookDates,
    childCookDates: f.childCookDates,
    tweakAddedAt,
    forgottenDays: settings.forgottenDays,
    now,
  });
}
