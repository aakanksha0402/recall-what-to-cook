import { describe, expect, it } from 'vitest';
import { editDistance, search, wordMatches, type SearchDoc } from './search';

const docs: SearchDoc<string>[] = [
  { item: 'palak', name: 'Palak paneer', ingredients: ['spinach', 'paneer', 'cream'], tags: ['north'], notes: '', tweakLines: ['Blend coarse, not smooth'] },
  { item: 'bhurji', name: 'Paneer bhurji', ingredients: ['paneer', 'onion', 'tomato'], tags: ['quick', 'lunchbox'], notes: 'Rolls into a paratha', tweakLines: [] },
  { item: 'gravy', name: 'Onion-tomato gravy', ingredients: ['onion', 'tomato'], tags: ['base'], notes: 'Half a spoon of sugar if the tomatoes are sour.', tweakLines: ['Onion until it truly browns'] },
  { item: 'mushroom', name: 'Mushroom masala', ingredients: ['mushroom', 'onion', 'tomato'], tags: [], notes: '', tweakLines: ['paneer instead of mushroom works, add it later', 'Half the chilli, more kasuri methi'] },
  { item: 'thepla', name: 'Methi thepla', ingredients: ['methi', 'wheat flour'], tags: ['lunchbox'], notes: "Mum's version", tweakLines: [] },
];

describe('editDistance', () => {
  it('counts transpositions as one', () => {
    expect(editDistance('panner', 'paneer', 2)).toBe(1);
    expect(editDistance('abcd', 'abdc', 2)).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBe(2);
  });
});

describe('wordMatches', () => {
  it('prefixes and typos', () => {
    expect(wordMatches('pan', 'paneer')).toBe(true);
    expect(wordMatches('panner', 'paneer')).toBe(true);
    expect(wordMatches('paner', 'paneer')).toBe(true);
    expect(wordMatches('rice', 'price')).toBe(false);
    expect(wordMatches('tom', 'tomato')).toBe(true);
    expect(wordMatches('tam', 'tomato')).toBe(false);
  });
});

describe('search', () => {
  it('finds dishes by name, ingredient, note and tweak text, with typo tolerance', () => {
    const r = search('panner', docs);
    expect(r.dishHits).toEqual(['palak', 'bhurji']);
    expect(r.tweakHits.map((h) => h.item)).toEqual(['mushroom']);
  });
  it('kasuri methi finds the tweak it was noted in; mum finds the note', () => {
    expect(search('kasuri methi', docs).tweakHits.map((h) => h.item)).toEqual(['mushroom']);
    expect(search('mum', docs).dishHits).toEqual(['thepla']);
  });
  it('#tag searches tags only', () => {
    expect(search('#lunchbox', docs).dishHits).toEqual(['bhurji', 'thepla']);
    expect(search('#quick paneer', docs).dishHits).toEqual(['bhurji']);
  });
  it('excludes by ingredient', () => {
    expect(search('paneer', docs, ['cream']).dishHits).toEqual(['bhurji']);
    expect(search('tomato -mushroom', docs).dishHits).toEqual(['bhurji', 'gravy']);
  });
  it('empty query returns nothing', () => {
    expect(search('  ', docs).dishHits).toEqual([]);
  });
});
