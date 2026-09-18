import { describe, expect, it } from 'vitest';
import { takeProposals, type ExpansionInput, type Plausibility } from './expansion';
import { buildIndex, type Lexicon } from './lexicon';

const lex: Lexicon = {
  ingredients: [
    { name: 'paneer', kind: 'fresh', group: 'protein', aliases: ['panner'] },
    { name: 'mushroom', kind: 'fresh', group: 'protein', aliases: [] },
    { name: 'cabbage', kind: 'fresh', group: 'vegetable', aliases: [] },
    { name: 'beetroot', kind: 'fresh', group: 'root', aliases: [] },
    { name: 'potato', kind: 'fresh', group: 'root', aliases: ['aloo'] },
    { name: 'peas', kind: 'fresh', group: 'legume', aliases: ['matar'] },
    { name: 'rice', kind: 'staple', group: 'grain', aliases: [] },
  ],
  forms: [
    { name: 'gravy', label: 'Gravy', aliases: [], effort: 2, minutes: 35, mealSlots: ['lunch', 'dinner'], isBaseCandidate: true },
    { name: 'poriyal', label: 'Dry stir-fry', aliases: [], effort: 1, minutes: 20, mealSlots: ['lunch', 'dinner'], isBaseCandidate: false },
    { name: 'thoran', label: 'Coconut stir-fry', aliases: [], effort: 1, minutes: 20, mealSlots: ['lunch', 'dinner'], isBaseCandidate: false },
    { name: 'sabzi', label: 'Dry veg', aliases: [], effort: 1, minutes: 25, mealSlots: ['lunch', 'dinner'], isBaseCandidate: false },
  ],
};
const plaus: Plausibility = {
  formAccepts: { gravy: ['protein', 'vegetable', 'root'], poriyal: ['vegetable', 'root'], thoran: ['vegetable', 'root'], sabzi: ['vegetable', 'root', 'legume'] },
  formExcludes: { thoran: ['potato'] },
  baseAdditions: { gravy: ['paneer', 'mushroom', 'kofta'] },
  pairings: [['potato', 'peas']],
};

const input: ExpansionInput = {
  lex: buildIndex(lex),
  plaus,
  existing: new Set(['mushroom gravy', 'cabbage poriyal']),
  refused: new Set(['paneer poriyal']),
  bases: [{ id: 7, name: 'Onion-tomato gravy', form: 'gravy' }],
  usedIngredients: ['cabbage', 'paneer', 'potato', 'beetroot', 'rice'],
  usedForms: ['poriyal', 'gravy'],
};

describe('generateProposals', () => {
  it('yields base additions first, skipping what exists or was refused', () => {
    const ps = takeProposals(input, 20);
    expect(ps[0]).toMatchObject({ name: 'Paneer gravy', from: 'your onion-tomato gravy + paneer', baseId: 7 });
    expect(ps.map((p) => p.name)).not.toContain('Mushroom gravy');
    expect(ps.map((p) => p.name)).not.toContain('Paneer poriyal');
    expect(ps.map((p) => p.name)).not.toContain('Cabbage poriyal');
    expect(ps.map((p) => p.name)).not.toContain('Kofta gravy'); // not a lexicon ingredient
  });
  it('respects group acceptance and excludes', () => {
    const names = takeProposals(input, 50).map((p) => p.name);
    expect(names).toContain('Beetroot poriyal');
    expect(names).toContain('Beetroot thoran');
    expect(names).not.toContain('Potato thoran');
    expect(names).not.toContain('Rice poriyal');
  });
  it('uses pairings and unused forms', () => {
    const names = takeProposals(input, 50).map((p) => p.name);
    expect(names).toContain('Potato peas sabzi');
    expect(names).toContain('Cabbage thoran');
  });
  it('takes only n', () => {
    expect(takeProposals(input, 3)).toHaveLength(3);
  });
});
