import { describe, expect, it } from 'vitest';
import { defaultBaseName, proposalSentence, suggestBases, type BaseCandidate } from './baseSuggest';

const d = (id: number, name: string, form: string | null, ing: string[], over: Partial<BaseCandidate> = {}): BaseCandidate => ({
  id,
  name,
  form,
  baseId: null,
  isBase: false,
  definingIngredients: ing,
  ...over,
});

describe('suggestBases', () => {
  it('proposes one base for three gravies sharing onion, tomato, ginger', () => {
    const dishes = [
      d(1, 'Paneer gravy', 'gravy', ['onion', 'tomato', 'ginger', 'paneer']),
      d(2, 'Mushroom gravy', 'gravy', ['onion', 'tomato', 'ginger', 'mushroom']),
      d(3, 'Corn capsicum gravy', 'gravy', ['onion', 'tomato', 'ginger', 'corn', 'capsicum']),
      d(4, 'Kadhi', 'gravy', ['curd', 'besan', 'ghee']),
      d(5, 'Beans poriyal', 'poriyal', ['beans', 'coconut']),
    ];
    const [p] = suggestBases(dishes);
    expect(p?.form).toBe('gravy');
    expect(p?.sharedIngredients).toEqual(['ginger', 'onion', 'tomato']);
    expect(p?.children.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(proposalSentence(p!)).toBe('Paneer gravy, Mushroom gravy and Corn capsicum gravy look like one base plus 3 additions. Create it?');
    expect(defaultBaseName(p!)).toBe('Onion-tomato gravy');
  });
  it('ignores dishes already linked or marked as bases', () => {
    const dishes = [
      d(1, 'A', 'gravy', ['onion', 'tomato', 'ginger'], { baseId: 9 }),
      d(2, 'B', 'gravy', ['onion', 'tomato', 'ginger']),
      d(3, 'C', 'gravy', ['onion', 'tomato', 'ginger'], { isBase: true }),
    ];
    expect(suggestBases(dishes)).toEqual([]);
  });
  it('needs three shared defining ingredients', () => {
    expect(suggestBases([d(1, 'A', 'kootu', ['dal', 'coconut', 'cumin']), d(2, 'B', 'kootu', ['dal', 'coconut', 'pepper'])])).toEqual([]);
  });
});
