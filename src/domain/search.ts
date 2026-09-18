export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();
}

/** Bounded Damerau–Levenshtein (optimal string alignment). Returns max+1 when over budget. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length]!;
}

function budgetFor(word: string): number {
  if (word.length <= 3) return 0;
  if (word.length <= 5) return 1;
  return 2;
}

export function wordMatches(q: string, w: string): boolean {
  if (w.startsWith(q)) return true;
  const budget = budgetFor(q);
  // A typo almost never lands on the first letter; requiring it keeps "rice" away from "price".
  if (!budget || q[0] !== w[0]) return false;
  if (editDistance(q, w, budget) <= budget) return true;
  // typo inside a longer word: compare against the same-length prefix
  if (w.length > q.length + 1) return editDistance(q, w.slice(0, q.length + 1), budget) <= budget;
  return false;
}

export interface SearchDoc<T> {
  item: T;
  name: string;
  ingredients: string[];
  tags: string[];
  notes: string;
  tweakLines: string[];
}

export interface SearchQuery {
  words: string[];
  tags: string[];
  excludes: string[];
}

export function parseQuery(raw: string): SearchQuery {
  const words: string[] = [];
  const tags: string[] = [];
  const excludes: string[] = [];
  for (const tok of raw.trim().split(/\s+/).filter(Boolean)) {
    const prefix = tok[0];
    const body = normalise(prefix === '#' || prefix === '-' ? tok.slice(1) : tok).replace(/#/g, '').trim();
    if (!body) continue;
    if (prefix === '#') tags.push(body);
    else if (prefix === '-') excludes.push(body);
    else words.push(...body.split(' '));
  }
  return { words, tags, excludes };
}

function textWords(parts: string[]): string[] {
  return normalise(parts.join(' ')).split(' ').filter(Boolean);
}

export interface SearchResult<T> {
  dishHits: T[];
  tweakHits: { item: T; line: string }[];
}

export function search<T>(raw: string, docs: SearchDoc<T>[], excludeIngredients: string[] = []): SearchResult<T> {
  const q = parseQuery(raw);
  const excludes = q.excludes.concat(excludeIngredients.map((e) => normalise(e)));
  if (!q.words.length && !q.tags.length) return { dishHits: [], tweakHits: [] };

  const dishHits: T[] = [];
  const tweakHits: { item: T; line: string }[] = [];
  for (const d of docs) {
    const tagWords = textWords(d.tags);
    if (q.tags.length && !q.tags.every((t) => tagWords.some((w) => wordMatches(t, w)))) continue;
    const ingWords = textWords(d.ingredients);
    if (excludes.length && excludes.some((e) => ingWords.some((w) => w === e || (e.length > 3 && w.startsWith(e))))) continue;
    const corpus = textWords([d.name, ...d.ingredients, ...d.tags, d.notes]);
    const tweakWords = textWords(d.tweakLines);
    const inCorpus = q.words.every((w) => corpus.some((c) => wordMatches(w, c)));
    const inTweaks = q.words.length > 0 && q.words.every((w) => tweakWords.some((c) => wordMatches(w, c)));
    if (inCorpus) dishHits.push(d.item);
    if (inTweaks) {
      const line = d.tweakLines.find((l) => q.words.every((w) => textWords([l]).some((c) => wordMatches(w, c)))) ?? d.tweakLines[0]!;
      tweakHits.push({ item: d.item, line });
    }
  }
  return { dishHits, tweakHits };
}
