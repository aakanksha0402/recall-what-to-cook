import { useState } from 'react';
import { Sheet } from '../components/bits';
import { useQuery, useRepo } from '../context';

export function NextUpPicker({ onClose }: { onClose: () => void }) {
  const repo = useRepo();
  const [q, setQ] = useState('');
  const { data: facts } = useQuery((r) => r.loadFacts());
  const query = q.trim().toLowerCase();
  const list = facts
    ? [...facts.values()]
        .map((f) => f.dish)
        .filter((d) => d.status !== 'retired' && (!query || d.name.toLowerCase().includes(query)))
        .slice(0, 40)
    : [];
  return (
    <Sheet onClose={onClose} title="Next up">
      <input className="input" type="text" placeholder="Search your dishes" value={q} onChange={(e) => setQ(e.target.value)} autoFocus style={{ marginBottom: 14 }} />
      <div className="stack" style={{ gap: 12 }}>
        {list.map((d) => (
          <div
            key={d.id}
            className="dsh row"
            style={{ fontSize: 18 }}
            onClick={async () => {
              await repo.setNextUp(d.id);
              onClose();
            }}
          >
            {d.name}
          </div>
        ))}
        {facts && !list.length && <div className="mut meta">No dish matches.</div>}
      </div>
    </Sheet>
  );
}
