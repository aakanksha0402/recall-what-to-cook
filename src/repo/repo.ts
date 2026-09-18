import type { Db, Row } from '../db/client';
import { exportJson, exportSqlite, importSqlite } from '../db/export';
import { migrate } from '../db/migrate';
import { defaultBaseName, suggestBases, type BaseCandidate, type BaseProposal } from '../domain/baseSuggest';
import { bucketFor, lastCook, type BucketResult } from '../domain/buckets';
import { addDays, mealSlotFor, nowIso, startOfMonthIso } from '../domain/clock';
import { generateProposals, proposalKey, type Plausibility, type Proposal } from '../domain/expansion';
import { normaliseWord, parseDishName, titleCase, type LexIndex } from '../domain/lexicon';
import { fillSlots, rankOne, type HomeSlots, type Ranked } from '../domain/ranking';
import { search as runSearch, type SearchDoc } from '../domain/search';
import type {
  CookEvent,
  Dish,
  DishFacts,
  DishIngredient,
  DishVersion,
  Ingredient,
  IngredientKind,
  MealSlot,
  Settings,
  Tag,
} from '../domain/types';

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

const NEXT_UP_ID = 1;
const NOT_TONIGHT_DAYS = 7;

export class Repo {
  private listeners = new Set<() => void>();

  constructor(
    readonly db: Db,
    readonly lex: LexIndex,
    readonly plaus: Plausibility,
  ) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  private q<T extends Row = Row>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.sql<T>(sql, ...params);
  }

  // ── boot ────────────────────────────────────────────────────────────────

  async boot(): Promise<void> {
    await migrate(this.db);
    await this.seedIngredients();
    await this.decayPantry();
  }

  private async seedIngredients(): Promise<void> {
    const version = String(this.lex.ingredients.length);
    const [row] = await this.q<{ value: string }>(`SELECT value FROM setting WHERE key = 'lexicon_version'`);
    if (row?.value === version) return;
    await this.db.batch((sql) => [
      ...this.lex.ingredients.map(
        (i) => sql`INSERT OR IGNORE INTO ingredient (name, kind, aliases) VALUES (${i.name}, ${i.kind}, ${JSON.stringify(i.aliases)})`,
      ),
      sql`INSERT OR REPLACE INTO setting (key, value) VALUES ('lexicon_version', ${version})`,
    ]);
  }

  // ── settings ────────────────────────────────────────────────────────────

  async settings(): Promise<Settings> {
    const rows = await this.q<{ key: string; value: string }>('SELECT key, value FROM setting');
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const num = (k: string, d: number) => Number(m.get(k) ?? d);
    return {
      freshDays: num('fresh_days', 5),
      suppressDays: num('suppress_days', 5),
      forgottenDays: num('forgotten_days', 60),
      weekendRelax: (m.get('weekend_relax') ?? '1') === '1',
    };
  }

  async setting(key: string): Promise<string | null> {
    const [row] = await this.q<{ value: string }>('SELECT value FROM setting WHERE key = ?', key);
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.q('INSERT OR REPLACE INTO setting (key, value) VALUES (?, ?)', key, value);
    this.changed();
  }

  // ── facts: everything the engines need, in six queries ──────────────────

  async loadFacts(now = new Date()): Promise<Map<number, DishFacts>> {
    const dishes = (await this.q('SELECT * FROM dish ORDER BY name COLLATE NOCASE')).map(rowToDish);
    const facts = new Map<number, DishFacts>();
    for (const d of dishes) {
      facts.set(d.id, {
        dish: d,
        cookDates: [],
        childCookDates: [],
        ingredients: [],
        tags: [],
        currentVersion: null,
        versionCount: 0,
        suppressedUntil: null,
      });
    }
    const byId = (id: unknown) => facts.get(Number(id));

    const cooks = await this.q<{ dish_id: number; cooked_at: string; base_id: number | null }>(
      'SELECT c.dish_id, c.cooked_at, d.base_id FROM cook_event c JOIN dish d ON d.id = c.dish_id ORDER BY c.cooked_at',
    );
    for (const c of cooks) {
      byId(c.dish_id)?.cookDates.push(c.cooked_at);
      if (c.base_id !== null) byId(c.base_id)?.childCookDates.push(c.cooked_at);
    }

    const ings = await this.q<{ dish_id: number; depth: number; id: number; name: string; kind: IngredientKind; aliases: string; role: DishIngredient['role'] }>(
      `WITH RECURSIVE chain(dish_id, anc_id, depth) AS (
         SELECT id, id, 0 FROM dish
         UNION ALL
         SELECT c.dish_id, d.base_id, c.depth + 1 FROM chain c JOIN dish d ON d.id = c.anc_id WHERE d.base_id IS NOT NULL AND c.depth < 8
       )
       SELECT c.dish_id, c.depth, i.id, i.name, i.kind, i.aliases, di.role
       FROM chain c JOIN dish_ingredient di ON di.dish_id = c.anc_id JOIN ingredient i ON i.id = di.ingredient_id
       ORDER BY c.dish_id, c.depth, i.name`,
    );
    for (const r of ings) {
      const f = byId(r.dish_id);
      if (!f || f.ingredients.some((x) => x.id === Number(r.id))) continue;
      f.ingredients.push({ id: Number(r.id), name: r.name, kind: r.kind, aliases: parseJson(r.aliases, []), role: r.role, inherited: Number(r.depth) > 0 });
    }

    const tags = await this.q<{ dish_id: number; name: string }>(
      'SELECT dt.dish_id, t.name FROM dish_tag dt JOIN tag t ON t.id = dt.tag_id ORDER BY t.name COLLATE NOCASE',
    );
    for (const t of tags) byId(t.dish_id)?.tags.push(t.name);

    const versions = await this.q('SELECT * FROM dish_version ORDER BY dish_id, n');
    for (const r of versions) {
      const v = rowToVersion(r);
      const f = facts.get(v.dishId);
      if (!f) continue;
      f.versionCount++;
      if (v.isCurrent) f.currentVersion = v;
    }

    const sup = await this.q<{ dish_id: number; until: string }>('SELECT dish_id, until FROM suppression WHERE until > ?', now.toISOString());
    for (const s of sup) {
      const f = byId(s.dish_id);
      if (f) f.suppressedUntil = s.until;
    }
    return facts;
  }

  async why(f: DishFacts, now = new Date()): Promise<BucketResult> {
    const settings = await this.settings();
    return whyFor(f, settings, now);
  }

  // ── home ────────────────────────────────────────────────────────────────

  async home(now = new Date(), slotOverride?: MealSlot): Promise<HomeView> {
    const [facts, settings, have, nextUp] = await Promise.all([this.loadFacts(now), this.settings(), this.pantryHave(), this.nextUpDish()]);
    const slot = slotOverride ?? mealSlotFor(now);
    const haveNames = new Set(have.map((h) => h.name));
    const ranked: Ranked[] = [];
    for (const f of facts.values()) ranked.push(rankOne(f, { now, slot, have: haveNames, settings }, this.minutesFor(f.dish.form)));
    const slots = fillSlots(ranked);
    return { ...slots, chips: await this.chips(facts, haveNames), nextUp, slot };
  }

  private minutesFor(form: string | null): number | null {
    return form ? (this.lex.formByAlias.get(normaliseWord(form))?.minutes ?? null) : null;
  }

  private async chips(facts: Map<number, DishFacts>, haveNames: Set<string>): Promise<Chip[]> {
    const counts = new Map<number, { name: string; n: number }>();
    for (const f of facts.values()) {
      if (f.dish.status === 'retired') continue;
      for (const i of f.ingredients) {
        if (i.kind !== 'fresh') continue;
        const c = counts.get(i.id) ?? { name: i.name, n: 0 };
        c.n++;
        counts.set(i.id, c);
      }
    }
    const have = await this.pantryHave();
    for (const h of have) if (!counts.has(h.id)) counts.set(h.id, { name: h.name, n: 0 });
    return [...counts.entries()]
      .map(([id, c]) => ({ id, name: c.name, have: haveNames.has(c.name), dishes: c.n }))
      .sort((a, b) => Number(b.have) - Number(a.have) || b.dishes - a.dishes || a.name.localeCompare(b.name))
      .slice(0, 12);
  }

  // ── pantry ──────────────────────────────────────────────────────────────

  async pantryHave(): Promise<Ingredient[]> {
    const rows = await this.q(
      `SELECT i.* FROM pantry p JOIN ingredient i ON i.id = p.ingredient_id WHERE p.state = 'have' ORDER BY i.name COLLATE NOCASE`,
    );
    return rows.map(rowToIngredient);
  }

  async togglePantry(ingredientId: number): Promise<void> {
    const [row] = await this.q('SELECT ingredient_id FROM pantry WHERE ingredient_id = ?', ingredientId);
    if (row) await this.q('DELETE FROM pantry WHERE ingredient_id = ?', ingredientId);
    else await this.q(`INSERT INTO pantry (ingredient_id, state, updated_at) VALUES (?, 'have', ?)`, ingredientId, nowIso());
    this.changed();
  }

  private async decayPantry(): Promise<void> {
    const { freshDays } = await this.settings();
    await this.q('DELETE FROM pantry WHERE updated_at < ?', addDays(new Date(), -freshDays).toISOString());
  }

  async freshIngredients(): Promise<Ingredient[]> {
    return (await this.q(`SELECT * FROM ingredient WHERE kind = 'fresh' ORDER BY name COLLATE NOCASE`)).map(rowToIngredient);
  }

  async staples(): Promise<Ingredient[]> {
    return (await this.q(`SELECT * FROM ingredient WHERE kind = 'staple' ORDER BY name COLLATE NOCASE`)).map(rowToIngredient);
  }

  async setIngredientKind(id: number, kind: IngredientKind): Promise<void> {
    await this.q('UPDATE ingredient SET kind = ? WHERE id = ?', kind, id);
    this.changed();
  }

  async ensureIngredient(name: string, kind: IngredientKind = 'fresh'): Promise<Ingredient> {
    const clean = name.trim().toLowerCase();
    const [existing] = await this.q('SELECT * FROM ingredient WHERE name = ? COLLATE NOCASE', clean);
    if (existing) return rowToIngredient(existing);
    await this.q(`INSERT INTO ingredient (name, kind, aliases) VALUES (?, ?, '[]')`, clean, kind);
    const [row] = await this.q('SELECT * FROM ingredient WHERE name = ? COLLATE NOCASE', clean);
    return rowToIngredient(row!);
  }

  /** Ingredient chip row on Dishes — ordered by how many dishes each one unlocks. */
  async ingredientRow(): Promise<Chip[]> {
    const rows = await this.q<{ id: number; name: string; n: number }>(
      `WITH RECURSIVE chain(dish_id, anc_id, depth) AS (
         SELECT id, id, 0 FROM dish WHERE status <> 'retired'
         UNION ALL
         SELECT c.dish_id, d.base_id, c.depth + 1 FROM chain c JOIN dish d ON d.id = c.anc_id WHERE d.base_id IS NOT NULL AND c.depth < 8
       )
       SELECT i.id, i.name, COUNT(DISTINCT c.dish_id) AS n
       FROM chain c JOIN dish_ingredient di ON di.dish_id = c.anc_id JOIN ingredient i ON i.id = di.ingredient_id
       WHERE i.kind = 'fresh'
       GROUP BY i.id ORDER BY n DESC, i.name COLLATE NOCASE`,
    );
    const have = new Set((await this.pantryHave()).map((h) => h.id));
    return rows.map((r) => ({ id: Number(r.id), name: r.name, have: have.has(Number(r.id)), dishes: Number(r.n) }));
  }

  // ── dishes ──────────────────────────────────────────────────────────────

  async dish(id: number): Promise<Dish | null> {
    const [row] = await this.q('SELECT * FROM dish WHERE id = ?', id);
    return row ? rowToDish(row) : null;
  }

  async findDishByName(name: string): Promise<Dish | null> {
    const [row] = await this.q('SELECT * FROM dish WHERE name = ? COLLATE NOCASE', name.trim());
    return row ? rowToDish(row) : null;
  }

  async dishCount(): Promise<number> {
    const [row] = await this.q<{ n: number }>(`SELECT COUNT(*) AS n FROM dish WHERE status <> 'retired'`);
    return Number(row?.n ?? 0);
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
        for (const t of parsed.tags) await this.addTag(existing.id, t, false);
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
      for (const t of parsed.tags) await this.addTag(id, t, false);
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
    return this.db.transaction(async (tx) => {
      await tx.sql(
        `INSERT INTO dish (name, status, form, base_id, is_base, effort, meal_slots, origin, confirmed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        d.name,
        d.status,
        d.form,
        d.baseId ?? null,
        d.isBase ? 1 : 0,
        d.effort,
        d.mealSlots.join(','),
        d.origin,
        d.confirmed ? now : null,
        now,
      );
      const [row] = await tx.sql<{ id: number }>('SELECT id FROM dish WHERE name = ? COLLATE NOCASE', d.name);
      const id = Number(row!.id);
      await tx.sql(`INSERT INTO dish_version (dish_id, n, tweaks, is_current, created_at) VALUES (?, 1, '[]', 1, ?)`, id, now);
      for (const name of d.ingredientNames) {
        const [ing] = await tx.sql<{ id: number }>('SELECT id FROM ingredient WHERE name = ? COLLATE NOCASE', name);
        let ingId = ing ? Number(ing.id) : null;
        if (ingId === null) {
          await tx.sql(`INSERT INTO ingredient (name, kind, aliases) VALUES (?, 'fresh', '[]')`, name);
          const [n] = await tx.sql<{ id: number }>('SELECT id FROM ingredient WHERE name = ? COLLATE NOCASE', name);
          ingId = Number(n!.id);
        }
        await tx.sql(
          `INSERT OR IGNORE INTO dish_ingredient (dish_id, ingredient_id, role, origin, confirmed) VALUES (?, ?, 'defining', ?, 1)`,
          id,
          ingId,
          d.origin,
        );
      }
      return id;
    });
  }

  async setPinned(id: number, pinned: boolean): Promise<void> {
    await this.q('UPDATE dish SET pinned = ? WHERE id = ?', pinned ? 1 : 0, id);
    this.changed();
  }

  async pinnedCount(): Promise<number> {
    const [row] = await this.q<{ n: number }>(`SELECT COUNT(*) AS n FROM dish WHERE pinned = 1 AND status <> 'retired'`);
    return Number(row?.n ?? 0);
  }

  async retire(id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.sql(`UPDATE dish SET status = 'retired', retired_at = ? WHERE id = ?`, nowIso(), id);
      await tx.sql('DELETE FROM next_up WHERE dish_id = ?', id);
    });
    this.changed();
  }

  async bringBack(id: number): Promise<void> {
    await this.q(`UPDATE dish SET status = 'known', retired_at = NULL WHERE id = ?`, id);
    this.changed();
  }

  async updateNotes(id: number, notes: string): Promise<void> {
    await this.q('UPDATE dish SET notes = ?, notes_updated_at = ? WHERE id = ?', notes, nowIso(), id);
    this.changed();
  }

  async rename(id: number, name: string): Promise<void> {
    await this.q('UPDATE dish SET name = ? WHERE id = ?', name.trim(), id);
    this.changed();
  }

  async setEffort(id: number, effort: 1 | 2 | 3): Promise<void> {
    await this.q('UPDATE dish SET effort = ? WHERE id = ?', effort, id);
    this.changed();
  }

  /** "Note a tweak": one line → a new current version carrying every earlier line plus this one. */
  async addTweak(id: number, line: string): Promise<DishVersion> {
    const text = line.trim();
    const now = nowIso();
    await this.db.transaction(async (tx) => {
      const [cur] = await tx.sql<{ n: number; tweaks: string; body: string | null }>(
        'SELECT n, tweaks, body FROM dish_version WHERE dish_id = ? AND is_current = 1',
        id,
      );
      const n = cur ? Number(cur.n) + 1 : 1;
      const tweaks = parseJson<string[]>(cur?.tweaks ?? '[]', []).concat([text]);
      await tx.sql('UPDATE dish_version SET is_current = 0 WHERE dish_id = ?', id);
      await tx.sql('INSERT INTO dish_version (dish_id, n, body, tweaks, is_current, created_at) VALUES (?, ?, ?, ?, 1, ?)', id, n, cur?.body ?? null, JSON.stringify(tweaks), now);
    });
    this.changed();
    const [row] = await this.q('SELECT * FROM dish_version WHERE dish_id = ? AND is_current = 1', id);
    return rowToVersion(row!);
  }

  async removeTweak(id: number, index: number): Promise<void> {
    const [cur] = await this.q<{ n: number; tweaks: string; body: string | null }>('SELECT n, tweaks, body FROM dish_version WHERE dish_id = ? AND is_current = 1', id);
    if (!cur) return;
    const tweaks = parseJson<string[]>(cur.tweaks, []);
    tweaks.splice(index, 1);
    await this.db.transaction(async (tx) => {
      await tx.sql('UPDATE dish_version SET is_current = 0 WHERE dish_id = ?', id);
      await tx.sql('INSERT INTO dish_version (dish_id, n, body, tweaks, is_current, created_at) VALUES (?, ?, ?, ?, 1, ?)', id, Number(cur.n) + 1, cur.body, JSON.stringify(tweaks), nowIso());
    });
    this.changed();
  }

  async versions(id: number): Promise<DishVersion[]> {
    return (await this.q('SELECT * FROM dish_version WHERE dish_id = ? ORDER BY n DESC', id)).map(rowToVersion);
  }

  async cookHistory(id: number): Promise<CookEvent[]> {
    return (await this.q('SELECT * FROM cook_event WHERE dish_id = ? ORDER BY cooked_at DESC', id)).map(rowToCook);
  }

  async setIngredients(id: number, names: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.sql('DELETE FROM dish_ingredient WHERE dish_id = ?', id);
      for (const raw of names) {
        const name = raw.trim().toLowerCase();
        if (!name) continue;
        await tx.sql(`INSERT OR IGNORE INTO ingredient (name, kind, aliases) VALUES (?, 'fresh', '[]')`, name);
        const [ing] = await tx.sql<{ id: number }>('SELECT id FROM ingredient WHERE name = ? COLLATE NOCASE', name);
        await tx.sql(`INSERT OR IGNORE INTO dish_ingredient (dish_id, ingredient_id, role, origin, confirmed) VALUES (?, ?, 'defining', 'typed', 1)`, id, Number(ing!.id));
      }
    });
    this.changed();
  }

  async detail(id: number, now = new Date()): Promise<DetailView | null> {
    const facts = await this.loadFacts(now);
    const f = facts.get(id);
    if (!f) return null;
    const settings = await this.settings();
    const why = whyFor(f, settings, now);
    const base = f.dish.baseId !== null ? (facts.get(f.dish.baseId)?.dish ?? null) : null;
    const siblings = base ? [...facts.values()].filter((x) => x.dish.baseId === base.id && x.dish.id !== id).map((x) => x.dish) : [];
    const children = [...facts.values()].filter((x) => x.dish.baseId === id).map((x) => x.dish);
    const form = f.dish.form ? this.lex.formByAlias.get(normaliseWord(f.dish.form)) : undefined;
    const [versions, history] = await Promise.all([this.versions(id), this.cookHistory(id)]);
    return { facts: f, why, base, siblings, children, versions, history, formLabel: form?.label ?? null, minutes: form?.minutes ?? null };
  }

  // ── tags ────────────────────────────────────────────────────────────────

  async tags(): Promise<Tag[]> {
    const rows = await this.q<{ id: number; name: string; n: number }>(
      `SELECT t.id, t.name, COUNT(d.id) AS n FROM tag t
       LEFT JOIN dish_tag dt ON dt.tag_id = t.id
       LEFT JOIN dish d ON d.id = dt.dish_id AND d.status <> 'retired'
       GROUP BY t.id ORDER BY n DESC, t.name COLLATE NOCASE`,
    );
    return rows.map((r) => ({ id: Number(r.id), name: r.name, count: Number(r.n) }));
  }

  async addTag(dishId: number, name: string, notify = true): Promise<void> {
    const clean = name.trim().replace(/^#/, '').toLowerCase();
    if (!clean) return;
    await this.db.transaction(async (tx) => {
      await tx.sql('INSERT OR IGNORE INTO tag (name, created_at) VALUES (?, ?)', clean, nowIso());
      const [t] = await tx.sql<{ id: number }>('SELECT id FROM tag WHERE name = ? COLLATE NOCASE', clean);
      await tx.sql('INSERT OR IGNORE INTO dish_tag (dish_id, tag_id) VALUES (?, ?)', dishId, Number(t!.id));
    });
    if (notify) this.changed();
  }

  async removeTag(dishId: number, name: string): Promise<void> {
    await this.q('DELETE FROM dish_tag WHERE dish_id = ? AND tag_id IN (SELECT id FROM tag WHERE name = ? COLLATE NOCASE)', dishId, name);
    await this.q('DELETE FROM tag WHERE id NOT IN (SELECT tag_id FROM dish_tag)');
    this.changed();
  }

  // ── cook / undo / next up / not tonight ─────────────────────────────────

  async cook(dishId: number, now = new Date()): Promise<CookReceipt> {
    const dish = (await this.dish(dishId))!;
    const receipt = await this.db.transaction(async (tx) => {
      const [v] = await tx.sql<{ id: number }>('SELECT id FROM dish_version WHERE dish_id = ? AND is_current = 1', dishId);
      await tx.sql('INSERT INTO cook_event (dish_id, cooked_at, version_id, meal_slot) VALUES (?, ?, ?, ?)', dishId, now.toISOString(), v ? Number(v.id) : null, mealSlotFor(now));
      const [ev] = await tx.sql<{ id: number }>('SELECT last_insert_rowid() AS id');
      const [nu] = await tx.sql<{ dish_id: number }>('SELECT dish_id FROM next_up WHERE id = ?', NEXT_UP_ID);
      const clearedNextUp = !!nu && Number(nu.dish_id) === dishId;
      if (clearedNextUp) await tx.sql('DELETE FROM next_up WHERE id = ?', NEXT_UP_ID);
      await tx.sql('DELETE FROM suppression WHERE dish_id = ?', dishId);
      return { eventId: Number(ev!.id), dish, clearedNextUp };
    });
    this.changed();
    return receipt;
  }

  async undoCook(receipt: CookReceipt): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.sql('DELETE FROM cook_event WHERE id = ?', receipt.eventId);
      if (receipt.clearedNextUp) await tx.sql('INSERT OR REPLACE INTO next_up (id, dish_id, set_at) VALUES (?, ?, ?)', NEXT_UP_ID, receipt.dish.id, nowIso());
    });
    this.changed();
  }

  async nextUpDish(): Promise<Dish | null> {
    const [row] = await this.q('SELECT d.* FROM next_up n JOIN dish d ON d.id = n.dish_id WHERE n.id = ?', NEXT_UP_ID);
    return row ? rowToDish(row) : null;
  }

  async setNextUp(dishId: number): Promise<void> {
    await this.q('INSERT OR REPLACE INTO next_up (id, dish_id, set_at) VALUES (?, ?, ?)', NEXT_UP_ID, dishId, nowIso());
    this.changed();
  }

  async clearNextUp(): Promise<void> {
    await this.q('DELETE FROM next_up WHERE id = ?', NEXT_UP_ID);
    this.changed();
  }

  async notTonight(dishId: number, now = new Date()): Promise<void> {
    await this.q('INSERT OR REPLACE INTO suppression (dish_id, until) VALUES (?, ?)', dishId, addDays(now, NOT_TONIGHT_DAYS).toISOString());
    this.changed();
  }

  // ── bases and variations ────────────────────────────────────────────────

  async markBase(id: number, isBase: boolean): Promise<void> {
    await this.q('UPDATE dish SET is_base = ? WHERE id = ?', isBase ? 1 : 0, id);
    this.changed();
  }

  /** Link to a base; unlinking copies the inherited ingredients down first so nothing is lost. */
  async setBase(id: number, baseId: number | null): Promise<void> {
    if (baseId === id) return;
    await this.db.transaction(async (tx) => {
      if (baseId === null) {
        const inherited = await tx.sql<{ ingredient_id: number; role: string }>(
          `WITH RECURSIVE chain(anc_id, depth) AS (
             SELECT base_id, 1 FROM dish WHERE id = ? AND base_id IS NOT NULL
             UNION ALL
             SELECT d.base_id, c.depth + 1 FROM chain c JOIN dish d ON d.id = c.anc_id WHERE d.base_id IS NOT NULL AND c.depth < 8
           )
           SELECT DISTINCT di.ingredient_id, di.role FROM chain c JOIN dish_ingredient di ON di.dish_id = c.anc_id`,
          id,
        );
        for (const r of inherited) {
          await tx.sql(`INSERT OR IGNORE INTO dish_ingredient (dish_id, ingredient_id, role, origin, confirmed) VALUES (?, ?, ?, 'typed', 1)`, id, Number(r.ingredient_id), r.role);
        }
      } else {
        await tx.sql('UPDATE dish SET is_base = 1 WHERE id = ?', baseId);
      }
      await tx.sql('UPDATE dish SET base_id = ? WHERE id = ?', baseId, id);
    });
    this.changed();
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
    await this.q('UPDATE dish SET is_base = 1 WHERE id = ?', baseId);
    this.changed();
    return id;
  }

  async baseSuggestions(): Promise<BaseProposal[]> {
    const rows = await this.q<{ id: number; name: string; form: string | null; base_id: number | null; is_base: number; ingredients: string | null }>(
      `SELECT d.id, d.name, d.form, d.base_id, d.is_base, GROUP_CONCAT(i.name, '|') AS ingredients
       FROM dish d LEFT JOIN dish_ingredient di ON di.dish_id = d.id AND di.role = 'defining' LEFT JOIN ingredient i ON i.id = di.ingredient_id
       WHERE d.status = 'known' GROUP BY d.id`,
    );
    const candidates: BaseCandidate[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      form: r.form,
      baseId: r.base_id === null ? null : Number(r.base_id),
      isBase: Number(r.is_base) === 1,
      definingIngredients: r.ingredients ? r.ingredients.split('|') : [],
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
    await this.db.transaction(async (tx) => {
      for (const c of p.children) {
        await tx.sql('UPDATE dish SET base_id = ? WHERE id = ?', baseId, c.id);
        await tx.sql(
          `DELETE FROM dish_ingredient WHERE dish_id = ? AND ingredient_id IN (SELECT id FROM ingredient WHERE name IN (${p.sharedIngredients.map(() => '?').join(',')}))`,
          c.id,
          ...p.sharedIngredients,
        );
      }
    });
    this.changed();
    return baseId;
  }

  // ── expansion proposals ─────────────────────────────────────────────────

  async proposals(n = 10): Promise<{ proposals: Proposal[]; answered: number }> {
    const [names, refused, bases, ingUse, formUse, answered] = await Promise.all([
      this.q<{ name: string }>('SELECT name FROM dish'),
      this.q<{ dish_key: string }>('SELECT dish_key FROM proposal_answer'),
      this.q<{ id: number; name: string; form: string | null }>('SELECT id, name, form FROM dish WHERE is_base = 1 AND status <> \'retired\''),
      this.q<{ name: string }>(
        `SELECT i.name FROM dish_ingredient di JOIN ingredient i ON i.id = di.ingredient_id JOIN dish d ON d.id = di.dish_id
         WHERE d.status <> 'retired' GROUP BY i.id ORDER BY COUNT(*) DESC, i.name`,
      ),
      this.q<{ form: string }>(`SELECT form FROM dish WHERE form IS NOT NULL AND status <> 'retired' GROUP BY form ORDER BY COUNT(*) DESC`),
      this.setting('proposals_answered'),
    ]);
    const input = {
      lex: this.lex,
      plaus: this.plaus,
      existing: new Set(names.map((r) => proposalKey(r.name))),
      refused: new Set(refused.map((r) => r.dish_key)),
      bases: bases.map((b) => ({ id: Number(b.id), name: b.name, form: b.form })),
      usedIngredients: ingUse.map((r) => r.name),
      usedForms: formUse.map((r) => r.form),
    };
    const out: Proposal[] = [];
    for (const p of generateProposals(input)) {
      out.push(p);
      if (out.length >= n) break;
    }
    return { proposals: out, answered: Number(answered ?? 0) };
  }

  async answerProposal(p: Proposal, answer: 'yes' | 'never' | 'no'): Promise<void> {
    if (answer === 'no') {
      await this.q('INSERT OR REPLACE INTO proposal_answer (dish_key, answer, answered_at) VALUES (?, ?, ?)', p.key, 'no', nowIso());
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
    await this.q(`INSERT OR REPLACE INTO setting (key, value) VALUES ('proposals_answered', ?)`, String(answered));
    this.changed();
  }

  // ── search / stats / export ─────────────────────────────────────────────

  async search(query: string, excludeIngredients: string[] = [], now = new Date()) {
    const facts = await this.loadFacts(now);
    const allVersions = await this.q<{ dish_id: number; tweaks: string }>('SELECT dish_id, tweaks FROM dish_version');
    const tweakLines = new Map<number, string[]>();
    for (const v of allVersions) {
      const list = tweakLines.get(Number(v.dish_id)) ?? [];
      for (const line of parseJson<string[]>(v.tweaks, [])) if (!list.includes(line)) list.push(line);
      tweakLines.set(Number(v.dish_id), list);
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
    const [c] = await this.q<{ n: number }>(
      `SELECT COUNT(DISTINCT c.dish_id) AS n FROM cook_event c JOIN dish d ON d.id = c.dish_id WHERE c.cooked_at >= ? AND d.status <> 'retired'`,
      startOfMonthIso(now),
    );
    const [k] = await this.q<{ n: number }>(`SELECT COUNT(*) AS n FROM dish WHERE status = 'known'`);
    return { cooked: Number(c?.n ?? 0), known: Number(k?.n ?? 0) };
  }

  async totals(): Promise<{ dishes: number; cooks: number }> {
    const [d] = await this.q<{ n: number }>('SELECT COUNT(*) AS n FROM dish');
    const [c] = await this.q<{ n: number }>('SELECT COUNT(*) AS n FROM cook_event');
    return { dishes: Number(d?.n ?? 0), cooks: Number(c?.n ?? 0) };
  }

  async exportSqlite(): Promise<void> {
    await exportSqlite(this.db);
    await this.setSetting('last_export_at', nowIso());
  }

  async exportJson(): Promise<void> {
    await exportJson(this.db);
    await this.setSetting('last_export_at', nowIso());
  }

  async importSqlite(file: File): Promise<void> {
    await importSqlite(this.db, file);
    await migrate(this.db);
    await this.seedIngredients();
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

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function rowToDish(r: Row): Dish {
  return {
    id: Number(r.id),
    name: String(r.name),
    status: r.status as Dish['status'],
    form: (r.form as string | null) ?? null,
    baseId: r.base_id === null || r.base_id === undefined ? null : Number(r.base_id),
    isBase: Number(r.is_base) === 1,
    effort: Number(r.effort) as Dish['effort'],
    mealSlots: String(r.meal_slots ?? '')
      .split(',')
      .filter(Boolean) as MealSlot[],
    pinned: Number(r.pinned) === 1,
    notes: String(r.notes ?? ''),
    notesUpdatedAt: (r.notes_updated_at as string | null) ?? null,
    retiredAt: (r.retired_at as string | null) ?? null,
    origin: r.origin as Dish['origin'],
    confirmedAt: (r.confirmed_at as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

function rowToIngredient(r: Row): Ingredient {
  return { id: Number(r.id), name: String(r.name), kind: r.kind as IngredientKind, aliases: parseJson(r.aliases as string, []) };
}

function rowToVersion(r: Row): DishVersion {
  return {
    id: Number(r.id),
    dishId: Number(r.dish_id),
    n: Number(r.n),
    body: (r.body as string | null) ?? null,
    tweaks: parseJson(r.tweaks as string, []),
    isCurrent: Number(r.is_current) === 1,
    createdAt: String(r.created_at),
  };
}

function rowToCook(r: Row): CookEvent {
  return {
    id: Number(r.id),
    dishId: Number(r.dish_id),
    cookedAt: String(r.cooked_at),
    versionId: r.version_id === null || r.version_id === undefined ? null : Number(r.version_id),
    mealSlot: r.meal_slot as MealSlot,
  };
}
