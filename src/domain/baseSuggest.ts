export interface BaseCandidate {
  id: number;
  name: string;
  form: string | null;
  baseId: number | null;
  isBase: boolean;
  definingIngredients: string[];
}

export interface BaseProposal {
  form: string;
  sharedIngredients: string[];
  children: BaseCandidate[];
}

const MIN_SHARED = 3;

/**
 * Spec §10 path 4: two or more known dishes with the same form sharing ≥3 defining
 * ingredients look like one base plus additions. Deterministic, one proposal per form.
 */
export function suggestBases(dishes: BaseCandidate[]): BaseProposal[] {
  const byForm = new Map<string, BaseCandidate[]>();
  for (const d of dishes) {
    if (!d.form || d.baseId !== null || d.isBase) continue;
    if (d.definingIngredients.length < MIN_SHARED) continue;
    const list = byForm.get(d.form) ?? [];
    list.push(d);
    byForm.set(d.form, list);
  }

  const proposals: BaseProposal[] = [];
  for (const [form, group] of byForm) {
    if (group.length < 2) continue;
    const clusters = new Map<string, { shared: string[]; children: Set<BaseCandidate> }>();
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const setB = new Set(b.definingIngredients);
        const shared = a.definingIngredients.filter((x) => setB.has(x)).sort();
        if (shared.length < MIN_SHARED) continue;
        const key = shared.join('|');
        const c = clusters.get(key) ?? { shared, children: new Set<BaseCandidate>() };
        for (const d of group) if (shared.every((s) => d.definingIngredients.includes(s))) c.children.add(d);
        clusters.set(key, c);
      }
    }
    let best: { shared: string[]; children: Set<BaseCandidate> } | null = null;
    for (const c of clusters.values()) {
      if (!best || c.children.size > best.children.size || (c.children.size === best.children.size && c.shared.length > best.shared.length)) best = c;
    }
    if (best) proposals.push({ form, sharedIngredients: best.shared, children: [...best.children].sort((x, y) => x.id - y.id) });
  }
  return proposals.sort((a, b) => b.children.length - a.children.length);
}

export function proposalSentence(p: BaseProposal): string {
  const names = p.children.map((c) => c.name);
  const list = names.length <= 3 ? joinAnd(names) : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  return `${list} look like one base plus ${p.children.length} additions. Create it?`;
}

function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

// The ingredients a home cook would name a base after, most base-like first.
const BASE_NAME_PRIORITY = ['onion', 'tomato', 'coconut', 'curd', 'tamarind', 'ginger', 'garlic', 'cashew'];

export function defaultBaseName(p: BaseProposal): string {
  const rank = (i: string) => {
    const idx = BASE_NAME_PRIORITY.indexOf(i);
    return idx === -1 ? BASE_NAME_PRIORITY.length : idx;
  };
  const core = [...p.sharedIngredients].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, 2).join('-');
  return `${core.charAt(0).toUpperCase()}${core.slice(1)} ${p.form}`;
}
