import type { LexIndex, LexIngredient } from './lexicon';
import { normaliseWord, titleCase } from './lexicon';

export interface Plausibility {
  formAccepts: Record<string, string[]>;
  formExcludes: Record<string, string[]>;
  baseAdditions: Record<string, string[]>;
  pairings: [string, string][] | Record<string, string[]>;
}

export interface ExpansionBase {
  id: number;
  name: string;
  form: string | null;
}

export interface ExpansionInput {
  lex: LexIndex;
  plaus: Plausibility;
  /** normalised names of every dish already in the table, any status */
  existing: Set<string>;
  /** proposal keys answered "No" */
  refused: Set<string>;
  bases: ExpansionBase[];
  /** canonical ingredient names the user's dishes use, most-used first */
  usedIngredients: string[];
  /** forms the user's dishes use, most-used first */
  usedForms: string[];
}

export interface Proposal {
  key: string;
  name: string;
  from: string;
  ingredients: string[];
  form: string | null;
  baseId: number | null;
}

export function proposalKey(name: string): string {
  return normaliseWord(name);
}

function pairingsOf(p: Plausibility): [string, string][] {
  if (Array.isArray(p.pairings)) return p.pairings;
  const out: [string, string][] = [];
  for (const [a, list] of Object.entries(p.pairings)) for (const b of list) out.push([a, b]);
  return out;
}

export function* generateProposals(input: ExpansionInput): Generator<Proposal> {
  const { lex, plaus } = input;
  const seen = new Set<string>();
  const ingredient = (name: string): LexIngredient | undefined => lex.ingredientByAlias.get(normaliseWord(name));
  const accepts = (form: string, ing: LexIngredient): boolean => {
    const groups = plaus.formAccepts[form];
    if (!groups || !groups.includes(ing.group)) return false;
    return !(plaus.formExcludes[form] ?? []).includes(ing.name);
  };
  const emit = function* (name: string, from: string, ingredients: string[], form: string | null, baseId: number | null): Generator<Proposal> {
    const key = proposalKey(name);
    if (seen.has(key) || input.existing.has(key) || input.refused.has(key)) return;
    seen.add(key);
    yield { key, name, from, ingredients, form, baseId };
  };

  // 1. base × addition
  for (const base of input.bases) {
    const form = base.form ?? 'gravy';
    for (const addition of plaus.baseAdditions[form] ?? []) {
      const ing = ingredient(addition);
      if (!ing) continue;
      yield* emit(`${titleCase(addition)} ${form}`, `your ${base.name.toLowerCase()} + ${addition}`, [ing.name], form, base.id);
    }
  }

  // 2. ingredient × form (both already in his vocabulary), then his pairings
  const usedIngs = input.usedIngredients.map(ingredient).filter((x): x is LexIngredient => !!x && x.kind === 'fresh');
  for (const form of input.usedForms) {
    for (const ing of usedIngs) {
      if (!accepts(form, ing)) continue;
      yield* emit(`${titleCase(ing.name)} ${form}`, `${ing.name} × ${form}`, [ing.name], form, null);
    }
  }
  const usedSet = new Set(usedIngs.map((i) => i.name));
  const usedFormSet = new Set(input.usedForms);
  const formsForPairs = input.usedForms.concat(lex.forms.map((f) => f.name).filter((f) => !usedFormSet.has(f)));
  for (const [a, b] of pairingsOf(plaus)) {
    if (!usedSet.has(a) && !usedSet.has(b)) continue;
    const ia = ingredient(a);
    const ib = ingredient(b);
    if (!ia || !ib) continue;
    for (const form of formsForPairs) {
      if (!accepts(form, ia) || !accepts(form, ib)) continue;
      yield* emit(`${titleCase(a)} ${b} ${form}`, `${a} + ${b} × ${form}`, [ia.name, ib.name], form, null);
      break;
    }
  }

  // 3. form × his ingredients (forms he has not used yet)
  for (const f of lex.forms) {
    if (usedFormSet.has(f.name)) continue;
    for (const ing of usedIngs.slice(0, 12)) {
      if (!accepts(f.name, ing)) continue;
      yield* emit(`${titleCase(ing.name)} ${f.name}`, `${ing.name} × ${f.name}`, [ing.name], f.name, null);
    }
  }
}

export function takeProposals(input: ExpansionInput, n: number): Proposal[] {
  const out: Proposal[] = [];
  for (const p of generateProposals(input)) {
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}
