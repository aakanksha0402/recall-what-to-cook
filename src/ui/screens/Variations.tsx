import { useMemo } from 'react';
import { listMeta } from '../../domain/present';
import { whyFor } from '../../repo/repo';
import { BackButton, DishRow, Kicker } from '../components/bits';
import { useNav, useQuery } from '../context';

export function VariationsScreen({ id }: { id: number }) {
  const nav = useNav();
  const now = useMemo(() => new Date(), []);
  const { data } = useQuery(
    async (r) => {
      const [facts, settings] = await Promise.all([r.loadFacts(now), r.settings()]);
      const self = facts.get(id);
      if (!self) return null;
      const baseId = self.dish.isBase || !self.dish.baseId ? self.dish.id : self.dish.baseId;
      const base = facts.get(baseId)!;
      const children = [...facts.values()].filter((f) => f.dish.baseId === baseId).map((f) => ({ f, why: whyFor(f, settings, now) }));
      return { self, base, children };
    },
    [id],
  );
  if (!data) return null;
  const { self, base, children } = data;
  const isBase = self.dish.id === base.dish.id;
  return (
    <div>
      <div style={{ padding: '8px 0 20px' }}>
        <BackButton />
      </div>
      <Kicker style={{ marginBottom: 6 }}>Built on</Kicker>
      <div className="dsh row" style={{ fontSize: 30, lineHeight: 1.06, letterSpacing: '-0.02em', marginBottom: 6 }} onClick={() => nav.go({ name: 'detail', id: base.dish.id })}>
        {base.dish.name}
      </div>
      <div className="mut" style={{ fontSize: 13, marginBottom: 28 }}>
        {isBase ? `${children.length} ${children.length === 1 ? 'dish is' : 'dishes are'} built on this` : `${self.dish.name} is one of ${children.length} built on it`}
      </div>
      <div className="stack" style={{ gap: 17, paddingBottom: 10 }}>
        {children.map(({ f, why }) => (
          <DishRow key={f.dish.id} name={f.dish.name} meta={listMeta(f, why)} onClick={() => nav.go({ name: 'detail', id: f.dish.id })} mutedName={f.dish.status === 'idea'} />
        ))}
      </div>
    </div>
  );
}
