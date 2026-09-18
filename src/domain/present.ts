import type { BucketResult } from './buckets';
import { lastCook } from './buckets';
import { shortDate } from './clock';
import type { DishFacts } from './types';

function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

/** The one-line meta under a dish name in lists — "Cooked 3 times · last 30 Jun". */
export function listMeta(f: DishFacts, why: BucketResult): string {
  const last = lastCook(f.cookDates);
  const lastPart = last ? `last ${shortDate(last)}` : null;
  switch (why.bucket) {
    case 'Retired':
      return last ? `Retired · ${lastPart}` : 'Retired';
    case 'Rut':
      return why.reason;
    case 'Forgotten':
      return `Forgotten · ${why.gapDays} days`;
    case 'New':
      return f.dish.origin === 'expansion' ? 'From proposals · never cooked' : 'Never cooked';
    case 'Favourite':
      return f.dish.pinned ? `Pinned · ${lastPart ?? 'never cooked'}` : `Favourite · ${lastPart}`;
    case 'NeedsWork':
      return `Tweak since last cook · ${lastPart}`;
    default:
      return last ? `Cooked ${times(f.cookDates.length)} · ${lastPart}` : 'Never cooked';
  }
}

/** Under the dish name on the detail screen — "Poriyal · 25 min", "Built on your onion-tomato gravy · 35 min". */
export function subLine(f: DishFacts, baseName: string | null, formLabel: string | null, minutes: number | null, childCount: number): string {
  const parts: string[] = [];
  if (baseName) parts.push(`Built on your ${baseName.toLowerCase()}`);
  else if (f.dish.isBase && childCount) parts.push(`${childCount === 1 ? 'One dish is' : `${childCount} dishes are`} built on this`);
  else if (f.dish.status === 'idea') parts.push('Idea · never cooked');
  else if (formLabel) parts.push(formLabel);
  if (minutes) parts.push(`${minutes} min`);
  else parts.push(f.dish.effort === 1 ? 'quick' : f.dish.effort === 3 ? 'takes time' : '30–45 min');
  return parts.join(' · ');
}

/** The quiet history line — "Cooked 3 times · last 30 Jun · version 1 of 1". */
export function historyLine(f: DishFacts, why: BucketResult): string {
  const last = lastCook(f.cookDates);
  const cur = f.currentVersion?.n ?? 1;
  const parts: string[] = [];
  if (!last) parts.push('Never cooked');
  else parts.push(`Cooked ${times(f.cookDates.length)}`, `last ${shortDate(last)}`);
  parts.push(`version ${cur} of ${f.versionCount}`);
  if (why.bucket === 'NeedsWork') parts.push('tweak added since last cook');
  return parts.join(' · ');
}
