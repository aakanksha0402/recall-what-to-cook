import type { Effort, IngredientKind, MealSlot } from './types';

export interface LexIngredient {
  name: string;
  kind: IngredientKind;
  group: string;
  aliases: string[];
}

export interface LexForm {
  name: string;
  label: string;
  aliases: string[];
  effort: Effort;
  minutes: number;
  mealSlots: MealSlot[];
  isBaseCandidate: boolean;
}

export interface Lexicon {
  ingredients: LexIngredient[];
  forms: LexForm[];
}

export interface LexIndex {
  ingredients: LexIngredient[];
  forms: LexForm[];
  ingredientByAlias: Map<string, LexIngredient>;
  formByAlias: Map<string, LexForm>;
  maxPhrase: number;
}

export interface ParsedName {
  name: string;
  ingredients: LexIngredient[];
  form: LexForm | null;
  tags: string[];
  effort: Effort;
  minutes: number | null;
  mealSlots: MealSlot[];
}

export function normaliseWord(w: string): string {
  return w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildIndex(lex: Lexicon): LexIndex {
  const ingredientByAlias = new Map<string, LexIngredient>();
  const formByAlias = new Map<string, LexForm>();
  let maxPhrase = 1;
  const add = <T>(map: Map<string, T>, key: string, value: T) => {
    const k = normaliseWord(key);
    if (!k) return;
    maxPhrase = Math.max(maxPhrase, k.split(' ').length);
    if (!map.has(k)) map.set(k, value);
  };
  for (const ing of lex.ingredients) {
    add(ingredientByAlias, ing.name, ing);
    for (const a of ing.aliases) add(ingredientByAlias, a, ing);
  }
  for (const f of lex.forms) {
    add(formByAlias, f.name, f);
    for (const a of f.aliases) add(formByAlias, a, f);
  }
  return { ingredients: lex.ingredients, forms: lex.forms, ingredientByAlias, formByAlias, maxPhrase };
}

const TAG_RE = /#([\p{L}\p{N}_-]+)/gu;

export function extractTags(raw: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = raw
    .replace(TAG_RE, (_, t: string) => {
      tags.push(t.replace(/[-_]+/g, ' ').trim());
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { text, tags: Array.from(new Set(tags.filter(Boolean))) };
}

function lookup<T>(map: Map<string, T>, phrase: string): T | undefined {
  const hit = map.get(phrase);
  if (hit) return hit;
  if (phrase.endsWith('es')) {
    const h2 = map.get(phrase.slice(0, -2));
    if (h2) return h2;
  }
  if (phrase.endsWith('s')) return map.get(phrase.slice(0, -1));
  return undefined;
}

export function parseDishName(raw: string, idx: LexIndex): ParsedName {
  const { text, tags } = extractTags(raw);
  const tokens = normaliseWord(text).split(' ').filter(Boolean);
  const ingredients: LexIngredient[] = [];
  let form: LexForm | null = null;
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let len = Math.min(idx.maxPhrase, tokens.length - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join(' ');
      const ing = lookup(idx.ingredientByAlias, phrase);
      const f = lookup(idx.formByAlias, phrase);
      if (!ing && !f) continue;
      const isTail = i + len === tokens.length;
      // A word that is both an ingredient and a form ("dal") reads as the form
      // only when it closes the name; "dal fry" is the lentil, "moong dal" is the form.
      if (f && (!ing || isTail || !form)) {
        if (ing && !isTail && !form) {
          ingredients.push(ing);
        } else {
          form = f;
        }
      } else if (ing) {
        ingredients.push(ing);
      }
      i += len;
      matched = true;
      break;
    }
    if (!matched) i++;
  }
  const uniq = Array.from(new Map(ingredients.map((x) => [x.name, x])).values());
  return {
    name: text,
    ingredients: uniq,
    form,
    tags,
    effort: form?.effort ?? 2,
    minutes: form?.minutes ?? null,
    mealSlots: form?.mealSlots ?? ['lunch', 'dinner'],
  };
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
