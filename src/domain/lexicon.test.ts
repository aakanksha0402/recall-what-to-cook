import { describe, expect, it } from 'vitest';
import { buildIndex, extractTags, parseDishName, type Lexicon } from './lexicon';

const lex: Lexicon = {
  ingredients: [
    { name: 'spinach', kind: 'fresh', group: 'leafy', aliases: ['palak', 'keerai'] },
    { name: 'potato', kind: 'fresh', group: 'root', aliases: ['aloo', 'urulaikizhangu'] },
    { name: 'beans', kind: 'fresh', group: 'vegetable', aliases: ['french beans'] },
    { name: 'dal', kind: 'staple', group: 'lentil', aliases: ['paruppu', 'daal'] },
    { name: 'moong dal', kind: 'staple', group: 'lentil', aliases: ['pasi paruppu'] },
    { name: 'raw banana', kind: 'fresh', group: 'vegetable', aliases: ['vazhakkai', 'plantain'] },
    { name: 'egg', kind: 'fresh', group: 'protein', aliases: ['eggs', 'anda'] },
    { name: 'brinjal', kind: 'fresh', group: 'vegetable', aliases: ['kathirikai', 'baingan'] },
  ],
  forms: [
    { name: 'paratha', label: 'Flatbread', aliases: ['parantha'], effort: 2, minutes: 30, mealSlots: ['breakfast', 'lunch', 'dinner'], isBaseCandidate: false },
    { name: 'usili', label: 'Lentil crumble', aliases: ['paruppu usili'], effort: 2, minutes: 40, mealSlots: ['lunch', 'dinner'], isBaseCandidate: false },
    { name: 'kootu', label: 'Lentil stew', aliases: [], effort: 2, minutes: 30, mealSlots: ['lunch', 'dinner'], isBaseCandidate: true },
    { name: 'curry', label: 'Gravy', aliases: [], effort: 2, minutes: 35, mealSlots: ['lunch', 'dinner'], isBaseCandidate: true },
    { name: 'varuval', label: 'Dry fry', aliases: ['fry', 'roast'], effort: 1, minutes: 25, mealSlots: ['lunch', 'dinner'], isBaseCandidate: false },
    { name: 'dal', label: 'Lentil stew', aliases: ['dal tadka'], effort: 1, minutes: 25, mealSlots: ['lunch', 'dinner'], isBaseCandidate: true },
  ],
};
const idx = buildIndex(lex);
const names = (s: string) => parseDishName(s, idx).ingredients.map((i) => i.name);

describe('parseDishName', () => {
  it('reads ingredient + form from a mixed-language name', () => {
    const p = parseDishName('Spinach aloo paratha', idx);
    expect(names('Spinach aloo paratha')).toEqual(['spinach', 'potato']);
    expect(p.form?.name).toBe('paratha');
    expect(p.effort).toBe(2);
    expect(p.mealSlots).toContain('breakfast');
  });
  it('matches multi-word aliases before single words', () => {
    expect(names('Beans paruppu usili')).toEqual(['beans']);
    expect(parseDishName('Beans paruppu usili', idx).form?.name).toBe('usili');
    expect(names('Vazhakkai varuval')).toEqual(['raw banana']);
  });
  it('saves a name with no lexicon hits as typed', () => {
    const p = parseDishName('Kootu', idx);
    expect(p.ingredients).toEqual([]);
    expect(p.form?.name).toBe('kootu');
    const q = parseDishName('Undhiyu', idx);
    expect(q.ingredients).toEqual([]);
    expect(q.form).toBeNull();
    expect(q.effort).toBe(2);
  });
  it('treats a word that is both ingredient and form by position', () => {
    expect(names('Dal fry')).toEqual(['dal']);
    expect(parseDishName('Dal fry', idx).form?.name).toBe('varuval');
    expect(parseDishName('Moong dal', idx).form).toBeNull();
    expect(names('Moong dal')).toEqual(['moong dal']);
    expect(parseDishName('Spinach dal', idx).form?.name).toBe('dal');
    expect(names('Spinach dal')).toEqual(['spinach']);
  });
  it('strips #tags and keeps them separately', () => {
    const p = parseDishName('Egg curry #quick #mums-recipe', idx);
    expect(p.name).toBe('Egg curry');
    expect(p.tags).toEqual(['quick', 'mums recipe']);
    expect(names('Egg curry #quick')).toEqual(['egg']);
  });
  it('tolerates plurals', () => {
    expect(names('Brinjals fry')).toEqual(['brinjal']);
  });
});

describe('extractTags', () => {
  it('dedupes and cleans', () => {
    expect(extractTags('x #a #a #b-c').tags).toEqual(['a', 'b c']);
  });
});
