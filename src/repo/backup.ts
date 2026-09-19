import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonArray } from './facts';

export const BACKUP_FORMAT = 'akku-json-2';

const TABLES = [
  'ingredient',
  'tag',
  'dish',
  'dish_version',
  'cook_event',
  'dish_ingredient',
  'dish_tag',
  'pantry',
  'suppression',
  'next_up',
  'proposal_answer',
  'setting',
] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown>;

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

async function fetchAll(sb: SupabaseClient, table: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await sb.from(table).select('*').range(from, from + 999), `export ${table}`) as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportJson(sb: SupabaseClient): Promise<void> {
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) {
    tables[t] = (await fetchAll(sb, t)).map((r) => {
      const { user_id: _u, ...rest } = r;
      return rest;
    });
  }
  const blob = new Blob([JSON.stringify({ format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), tables }, null, 2)], { type: 'application/json' });
  download(blob, `akku-${new Date().toISOString().slice(0, 10)}.json`);
}

// Accepts both this format and the older on-device export ({ exportedAt, tables } with 0/1 booleans and JSON strings).
const bool = (v: unknown) => v === true || v === 1 || v === '1';
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown, d = '') => (v === null || v === undefined ? d : String(v));

export async function importJson(sb: SupabaseClient, file: File): Promise<{ dishes: number; cooks: number }> {
  const parsed = JSON.parse(await file.text()) as { tables?: Record<string, Row[]> };
  const t = parsed.tables;
  if (!t || !Array.isArray(t.dish)) throw new Error('Not an Akku export.');
  const get = (name: Table): Row[] => t[name] ?? [];

  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error('Not signed in.');

  // Wipe the user's rows, children first.
  for (const table of ['dish_tag', 'dish_ingredient', 'cook_event', 'dish_version', 'suppression', 'next_up', 'pantry', 'proposal_answer', 'setting', 'dish', 'tag', 'ingredient']) {
    must(await sb.from(table).delete().eq('user_id', uid), `clear ${table}`);
  }

  const ingredientIds = new Map<number, number>();
  const ingRows = get('ingredient').map((r) => ({ name: str(r.name).toLowerCase(), kind: str(r.kind, 'fresh'), aliases: jsonArray(r.aliases) }));
  if (ingRows.length) {
    const inserted = must(await sb.from('ingredient').insert(ingRows).select('id, name'), 'ingredients') as { id: number; name: string }[];
    const byName = new Map(inserted.map((i) => [i.name.toLowerCase(), i.id]));
    for (const r of get('ingredient')) ingredientIds.set(Number(r.id), byName.get(str(r.name).toLowerCase())!);
  }

  const tagIds = new Map<number, number>();
  const tagRows = get('tag').map((r) => ({ name: str(r.name).toLowerCase() }));
  if (tagRows.length) {
    const inserted = must(await sb.from('tag').insert(tagRows).select('id, name'), 'tags') as { id: number; name: string }[];
    const byName = new Map(inserted.map((i) => [i.name.toLowerCase(), i.id]));
    for (const r of get('tag')) tagIds.set(Number(r.id), byName.get(str(r.name).toLowerCase())!);
  }

  const dishIds = new Map<number, number>();
  const dishes = get('dish');
  if (dishes.length) {
    const rows = dishes.map((r) => ({
      name: str(r.name),
      status: str(r.status, 'known'),
      form: r.form == null ? null : str(r.form),
      is_base: bool(r.is_base),
      effort: num(r.effort) ?? 2,
      meal_slots: str(r.meal_slots, 'lunch,dinner'),
      pinned: bool(r.pinned),
      notes: str(r.notes),
      notes_updated_at: r.notes_updated_at == null ? null : str(r.notes_updated_at),
      retired_at: r.retired_at == null ? null : str(r.retired_at),
      origin: str(r.origin, 'typed'),
      confirmed_at: r.confirmed_at == null ? null : str(r.confirmed_at),
      created_at: str(r.created_at, new Date().toISOString()),
    }));
    const inserted = must(await sb.from('dish').insert(rows).select('id, name'), 'dishes') as { id: number; name: string }[];
    const byName = new Map(inserted.map((d) => [d.name.toLowerCase(), d.id]));
    for (const r of dishes) dishIds.set(Number(r.id), byName.get(str(r.name).toLowerCase())!);
    for (const r of dishes) {
      const base = num(r.base_id);
      if (base !== null && dishIds.has(base)) must(await sb.from('dish').update({ base_id: dishIds.get(base) }).eq('id', dishIds.get(Number(r.id))!), 'base links');
    }
  }
  const dishId = (v: unknown) => dishIds.get(Number(v));

  const versionIds = new Map<number, number>();
  const versions = get('dish_version').filter((r) => dishId(r.dish_id));
  for (const r of versions) {
    const row = must(
      await sb
        .from('dish_version')
        .insert({ dish_id: dishId(r.dish_id), n: num(r.n) ?? 1, body: r.body == null ? null : str(r.body), tweaks: jsonArray(r.tweaks), is_current: bool(r.is_current), created_at: str(r.created_at, new Date().toISOString()) })
        .select('id')
        .single(),
      'versions',
    ) as { id: number };
    versionIds.set(Number(r.id), row.id);
  }

  const cooks = get('cook_event')
    .filter((r) => dishId(r.dish_id))
    .map((r) => ({ dish_id: dishId(r.dish_id), cooked_at: str(r.cooked_at), version_id: r.version_id == null ? null : (versionIds.get(Number(r.version_id)) ?? null), meal_slot: str(r.meal_slot, 'dinner') }));
  if (cooks.length) must(await sb.from('cook_event').insert(cooks), 'cooks');

  const links = get('dish_ingredient')
    .filter((r) => dishId(r.dish_id) && ingredientIds.get(Number(r.ingredient_id)))
    .map((r) => ({ dish_id: dishId(r.dish_id), ingredient_id: ingredientIds.get(Number(r.ingredient_id)), role: str(r.role, 'main'), origin: str(r.origin, 'typed'), confirmed: r.confirmed == null ? true : bool(r.confirmed) }));
  if (links.length) must(await sb.from('dish_ingredient').upsert(links, { onConflict: 'dish_id,ingredient_id', ignoreDuplicates: true }), 'ingredient links');

  const dishTags = get('dish_tag')
    .filter((r) => dishId(r.dish_id) && tagIds.get(Number(r.tag_id)))
    .map((r) => ({ dish_id: dishId(r.dish_id), tag_id: tagIds.get(Number(r.tag_id)) }));
  if (dishTags.length) must(await sb.from('dish_tag').upsert(dishTags, { onConflict: 'dish_id,tag_id', ignoreDuplicates: true }), 'tag links');

  const pantry = get('pantry')
    .filter((r) => ingredientIds.get(Number(r.ingredient_id)))
    .map((r) => ({ ingredient_id: ingredientIds.get(Number(r.ingredient_id)), state: str(r.state, 'have'), updated_at: str(r.updated_at, new Date().toISOString()) }));
  if (pantry.length) must(await sb.from('pantry').insert(pantry), 'pantry');

  const sup = get('suppression')
    .filter((r) => dishId(r.dish_id))
    .map((r) => ({ dish_id: dishId(r.dish_id), until: str(r.until) }));
  if (sup.length) must(await sb.from('suppression').insert(sup), 'suppression');

  const nu = get('next_up').find((r) => dishId(r.dish_id));
  if (nu) must(await sb.from('next_up').insert({ dish_id: dishId(nu.dish_id), set_at: str(nu.set_at, new Date().toISOString()) }), 'next up');

  const answers = get('proposal_answer').map((r) => ({ dish_key: str(r.dish_key), answer: 'no', answered_at: str(r.answered_at, new Date().toISOString()) }));
  if (answers.length) must(await sb.from('proposal_answer').upsert(answers, { onConflict: 'user_id,dish_key' }), 'proposal answers');

  const settings = get('setting')
    .filter((r) => str(r.key) !== 'lexicon_version')
    .map((r) => ({ key: str(r.key), value: str(r.value) }));
  if (settings.length) must(await sb.from('setting').upsert(settings, { onConflict: 'user_id,key' }), 'settings');

  return { dishes: dishes.length, cooks: cooks.length };
}
