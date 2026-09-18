import { useEffect, useState } from 'react';
import { listMeta } from '../../domain/present';
import { whyFor } from '../../repo/repo';
import { Chip, DishRow, Kicker } from '../components/bits';
import { useNav, useQuery } from '../context';

export function SearchScreen() {
  const nav = useNav();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [excludes, setExcludes] = useState<string[]>([]);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 120);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data } = useQuery(
    async (r) => {
      const now = new Date();
      const [res, settings] = await Promise.all([r.search(debounced, excludes, now), r.settings()]);
      const hits = res.dishHits.map((f) => ({ f, why: whyFor(f, settings, now) }));
      const ingredientCounts = new Map<string, number>();
      for (const h of hits) for (const i of h.f.ingredients) if (i.kind === 'fresh') ingredientCounts.set(i.name, (ingredientCounts.get(i.name) ?? 0) + 1);
      const chips = [...ingredientCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
      return { hits, tweakHits: res.tweakHits, chips };
    },
    [debounced, excludes.join('|')],
  );

  const words = debounced.trim().split(/\s+/).filter(Boolean);
  return (
    <div>
      <div className="hstack" style={{ gap: 10, padding: '8px 0 14px' }}>
        <input
          className="input"
          type="search"
          placeholder="Name, ingredient, tag, note or tweak"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          style={{ margin: 0 }}
        />
        <button type="button" className="link fixed" style={{ fontSize: 13 }} onClick={nav.back}>
          Done
        </button>
      </div>
      <div className="wrap" style={{ marginBottom: 22 }}>
        {words.map((w) => (
          <Chip key={w} on>
            {w}
          </Chip>
        ))}
        {excludes.map((e) => (
          <Chip key={`-${e}`} onClick={() => setExcludes(excludes.filter((x) => x !== e))} title="Remove exclusion">
            not {e} ×
          </Chip>
        ))}
        {data?.chips
          .filter((c) => !excludes.includes(c) && !words.includes(c))
          .map((c) => (
            <Chip key={c} muted onClick={() => setQ((cur) => `${cur.trim()} ${c}`.trim())} onLongPress={() => setExcludes([...excludes, c])} title="Tap to add, hold to exclude">
              {c}
            </Chip>
          ))}
      </div>
      {!debounced.trim() ? (
        <div className="mut" style={{ fontSize: 13 }}>
          Typos are fine — <em>panner</em> finds paneer. Use <em>#tag</em> for tags, and hold an ingredient chip to exclude it.
        </div>
      ) : (
        <>
          <Kicker ink style={{ marginBottom: 10 }}>
            Dishes — {data?.hits.length ?? 0}
          </Kicker>
          <div className="stack" style={{ gap: 15, marginBottom: 28 }}>
            {data?.hits.map(({ f, why }) => (
              <DishRow key={f.dish.id} name={f.dish.name} meta={listMeta(f, why)} onClick={() => nav.go({ name: 'detail', id: f.dish.id })} />
            ))}
          </div>
          <Kicker ink style={{ marginBottom: 10 }}>
            In your tweaks — {data?.tweakHits.length ?? 0}
          </Kicker>
          <div className="stack" style={{ gap: 15, paddingBottom: 10 }}>
            {data?.tweakHits.map((h) => (
              <div key={h.item.dish.id} className="row" onClick={() => nav.go({ name: 'detail', id: h.item.dish.id })}>
                <div className="dsh" style={{ fontSize: 17 }}>
                  {h.item.dish.name}
                </div>
                <div className="mut" style={{ fontSize: 12.5 }}>
                  “{h.line}”
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
