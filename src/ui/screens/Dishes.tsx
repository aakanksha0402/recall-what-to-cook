import { useMemo, useState } from 'react';
import { proposalSentence, type BaseProposal } from '../../domain/baseSuggest';
import { listMeta } from '../../domain/present';
import type { DishFacts } from '../../domain/types';
import { whyFor } from '../../repo/repo';
import { Chip, DishRow, Empty, Kicker, PlateNumeral } from '../components/bits';
import { useNav, useQuery, useRepo } from '../context';
import { FilterSheet, applyFilters, emptyFilters, filterSummary, type Filters } from './FilterSheet';

export function DishesScreen() {
  const repo = useRepo();
  const nav = useNav();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const now = useMemo(() => new Date(), []);

  const { data } = useQuery(async (r) => {
    const [facts, settings, tags, ingredients, board, bases] = await Promise.all([
      r.loadFacts(now),
      r.settings(),
      r.tags(),
      r.ingredientRow(),
      r.scoreboard(now),
      r.baseSuggestions(),
    ]);
    const rows = [...facts.values()].map((f) => ({ f, why: whyFor(f, settings, now) }));
    return { rows, tags, ingredients, board, bases };
  });

  if (!data) return null;
  const { rows, tags, ingredients, board, bases } = data;
  const active = filters.tag || filters.ingredient || filters.status || filters.effort || filters.meal || filters.base;
  const visible = rows.filter((r) => r.f.dish.status !== 'retired');
  const filtered = applyFilters(rows, filters).filter((r) => filters.status === 'retired' || r.f.dish.status !== 'retired');
  const pinned = filtered.filter((r) => r.f.dish.pinned && !filters.status);
  const listed = filtered.filter((r) => !(r.f.dish.pinned && !filters.status));
  const retired = rows.filter((r) => r.f.dish.status === 'retired');
  const open = (f: DishFacts) => nav.go({ name: 'detail', id: f.dish.id });

  return (
    <div>
      <div className="between" style={{ padding: '8px 0 14px' }}>
        <div className="dsh title">Dishes</div>
        <button type="button" className="link" style={{ fontSize: 12 }} onClick={() => setShowFilters(true)}>
          {active ? `Filters · ${filterSummary(filters)}` : 'Filters'}
        </button>
      </div>
      <input className="input" type="text" placeholder="Name, ingredient, tag or tweak" onFocus={() => nav.go({ name: 'search' })} readOnly style={{ marginBottom: 16 }} />

      {bases[0] && <BaseCard p={bases[0]} onAccept={() => void repo.acceptBaseSuggestion(bases[0]!)} />}

      {rows.length === 0 ? (
        <Empty title="No dishes yet." body="Type what you cook — one dish per line — and this list fills itself." action="Add dishes" onAction={() => nav.setTab('add')} />
      ) : (
        <>
          {ingredients.length > 0 && (
            <>
              <Kicker>By ingredient</Kicker>
              <div className="hscroll" style={{ marginBottom: 18 }}>
                {ingredients.slice(0, 20).map((i) => (
                  <Chip key={i.id} on={filters.ingredient === i.name} onClick={() => setFilters({ ...filters, ingredient: filters.ingredient === i.name ? null : i.name })}>
                    {cap(i.name)} {i.dishes}
                  </Chip>
                ))}
              </div>
            </>
          )}
          {tags.length > 0 && (
            <>
              <Kicker>Filter by tag</Kicker>
              <div className="wrap" style={{ marginBottom: 8 }}>
                {tags
                  .filter((t) => t.count > 0)
                  .map((t) => (
                    <Chip key={t.id} on={filters.tag === t.name} onClick={() => setFilters({ ...filters, tag: filters.tag === t.name ? null : t.name })}>
                      {t.name} {t.count}
                    </Chip>
                  ))}
              </div>
              <div className="mut meta" style={{ marginBottom: 20 }}>
                {filters.tag
                  ? `${listed.length + pinned.length} ${listed.length + pinned.length === 1 ? 'dish' : 'dishes'} tagged ${filters.tag} · tap again to clear`
                  : 'Tags come from the dishes themselves. Tap one to narrow the list.'}
              </div>
            </>
          )}

          <div className="hstack" style={{ alignItems: 'baseline', gap: 10, marginBottom: 24 }}>
            <PlateNumeral value={board.cooked} />
            <div style={{ fontSize: 13, lineHeight: 1.35 }}>
              different {board.cooked === 1 ? 'dish' : 'dishes'} this month,
              <br />
              out of <strong>{board.known}</strong> you know
            </div>
          </div>

          {pinned.length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <Kicker style={{ marginBottom: 10 }}>Pinned — {pinned.length}</Kicker>
              <div className="stack" style={{ gap: 14 }}>
                {pinned.map(({ f, why }) => (
                  <div key={f.dish.id} className="between">
                    <span className="row grow" onClick={() => open(f)}>
                      <span className="dsh list-name">{f.dish.name}</span>
                      <span className="mut meta" style={{ display: 'block' }}>
                        {listMeta(f, why)}
                      </span>
                    </span>
                    <button type="button" className="link fixed" style={{ fontSize: 12 }} onClick={() => void repo.setPinned(f.dish.id, false)}>
                      Unpin
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="stack" style={{ gap: 16 }}>
            {listed.map(({ f, why }) => (
              <DishRow key={f.dish.id} name={f.dish.name} meta={listMeta(f, why)} onClick={() => open(f)} mutedName={f.dish.status === 'retired'} />
            ))}
            {!listed.length && !pinned.length && <div className="mut meta">Nothing matches these filters.</div>}
          </div>

          {retired.length > 0 && !filters.status && (
            <div style={{ paddingTop: 30 }}>
              <Kicker style={{ marginBottom: 10 }}>Retired — {retired.length}</Kicker>
              <div className="stack" style={{ gap: 13 }}>
                {retired.map(({ f }) => (
                  <div key={f.dish.id} className="between">
                    <span className="dsh row mut" style={{ fontSize: 17 }} onClick={() => open(f)}>
                      {f.dish.name}
                    </span>
                    <button type="button" className="link fixed" style={{ fontSize: 12 }} onClick={() => void repo.bringBack(f.dish.id)}>
                      Bring back
                    </button>
                  </div>
                ))}
              </div>
              <div className="mut meta" style={{ marginTop: 10 }}>
                Retired dishes stay in the database and in search — they just stop being suggested.
              </div>
            </div>
          )}
          <div className="mut meta" style={{ marginTop: 30 }}>
            {visible.length} {visible.length === 1 ? 'dish' : 'dishes'} in your repertoire.
          </div>
        </>
      )}

      {showFilters && <FilterSheet filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} tags={tags} ingredients={ingredients} />}
    </div>
  );
}

function BaseCard({ p, onAccept }: { p: BaseProposal; onAccept: () => void }) {
  return (
    <div style={{ background: 'var(--color-accent-100)', padding: '12px 14px', borderRadius: 'var(--radius-md)', marginBottom: 22 }}>
      <Kicker style={{ marginBottom: 6 }}>One base, several additions?</Kicker>
      <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>{proposalSentence(p)}</div>
      <div className="mut meta" style={{ marginBottom: 10 }}>
        Shared: {p.sharedIngredients.join(', ')}. Fix the base once and every variation follows.
      </div>
      <button type="button" className="btn btn-primary" onClick={onAccept}>
        Create the base
      </button>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
