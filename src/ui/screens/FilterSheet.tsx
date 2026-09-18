import type { BucketResult } from '../../domain/buckets';
import type { DishFacts, Effort, MealSlot, Tag } from '../../domain/types';
import type { Chip as ChipRow } from '../../repo/repo';
import { Chip, Kicker, Sheet } from '../components/bits';

export type StatusFilter = 'never' | 'not-recently' | 'untried' | 'pinned' | 'retired' | null;

export interface Filters {
  tag: string | null;
  ingredient: string | null;
  meal: MealSlot | null;
  effort: Effort | null;
  status: StatusFilter;
  base: boolean;
}

export const emptyFilters: Filters = { tag: null, ingredient: null, meal: null, effort: null, status: null, base: false };

export function filterSummary(f: Filters): string {
  const parts: string[] = [];
  if (f.ingredient) parts.push(f.ingredient);
  if (f.tag) parts.push(`#${f.tag}`);
  if (f.meal) parts.push(f.meal);
  if (f.effort) parts.push(f.effort === 1 ? 'quick' : f.effort === 2 ? 'medium' : 'long');
  if (f.status) parts.push(f.status.replace('-', ' '));
  if (f.base) parts.push('bases');
  return parts.join(' · ');
}

export function applyFilters(rows: { f: DishFacts; why: BucketResult }[], fl: Filters) {
  return rows.filter(({ f, why }) => {
    const d = f.dish;
    if (fl.tag && !f.tags.includes(fl.tag)) return false;
    if (fl.ingredient && !f.ingredients.some((i) => i.name === fl.ingredient)) return false;
    if (fl.meal && !d.mealSlots.includes(fl.meal)) return false;
    if (fl.effort && d.effort !== fl.effort) return false;
    if (fl.base && !d.isBase) return false;
    switch (fl.status) {
      case 'never':
        return f.cookDates.length === 0;
      case 'not-recently':
        return why.bucket === 'Forgotten';
      case 'untried':
        return d.status === 'idea';
      case 'pinned':
        return d.pinned;
      case 'retired':
        return d.status === 'retired';
      default:
        return true;
    }
  });
}

export function FilterSheet({
  filters,
  onChange,
  onClose,
  tags,
  ingredients,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
  tags: Tag[];
  ingredients: ChipRow[];
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: filters[k] === v ? (k === 'base' ? false : null) : v });
  const statuses: { v: StatusFilter; label: string }[] = [
    { v: 'never', label: 'Never cooked' },
    { v: 'not-recently', label: 'Not cooked recently' },
    { v: 'untried', label: 'Saved, untried' },
    { v: 'pinned', label: 'Pinned' },
    { v: 'retired', label: 'Retired' },
  ];
  return (
    <Sheet onClose={onClose} title="Filters">
      <Kicker>Ingredient</Kicker>
      <div className="wrap" style={{ marginBottom: 20 }}>
        {ingredients.slice(0, 24).map((i) => (
          <Chip key={i.id} on={filters.ingredient === i.name} onClick={() => set('ingredient', i.name)}>
            {i.name}
          </Chip>
        ))}
        {!ingredients.length && <span className="mut meta">No ingredients yet.</span>}
      </div>
      <Kicker>Tag</Kicker>
      <div className="wrap" style={{ marginBottom: 20 }}>
        {tags
          .filter((t) => t.count > 0)
          .map((t) => (
            <Chip key={t.id} on={filters.tag === t.name} onClick={() => set('tag', t.name)}>
              {t.name}
            </Chip>
          ))}
        {!tags.length && <span className="mut meta">No tags yet.</span>}
      </div>
      <Kicker>Meal</Kicker>
      <div className="wrap" style={{ marginBottom: 20 }}>
        {(['breakfast', 'lunch', 'dinner'] as MealSlot[]).map((m) => (
          <Chip key={m} on={filters.meal === m} onClick={() => set('meal', m)}>
            {m}
          </Chip>
        ))}
      </div>
      <Kicker>Effort</Kicker>
      <div className="wrap" style={{ marginBottom: 20 }}>
        {([1, 2, 3] as Effort[]).map((e) => (
          <Chip key={e} on={filters.effort === e} onClick={() => set('effort', e)}>
            {e === 1 ? 'quick' : e === 2 ? '30–45 min' : 'takes time'}
          </Chip>
        ))}
      </div>
      <Kicker>Status</Kicker>
      <div className="wrap" style={{ marginBottom: 20 }}>
        {statuses.map((s) => (
          <Chip key={s.v} on={filters.status === s.v} onClick={() => set('status', s.v)}>
            {s.label}
          </Chip>
        ))}
      </div>
      <Kicker>Base preparations</Kicker>
      <div className="wrap" style={{ marginBottom: 24 }}>
        <Chip on={filters.base} onClick={() => set('base', true)}>
          Only bases
        </Chip>
      </div>
      <button type="button" className="btn btn-secondary btn-block" onClick={() => onChange(emptyFilters)}>
        Clear filters
      </button>
    </Sheet>
  );
}
