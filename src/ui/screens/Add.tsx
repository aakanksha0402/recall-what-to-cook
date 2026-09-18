import { useMemo, useState } from 'react';
import type { Proposal } from '../../domain/expansion';
import { parseDishName } from '../../domain/lexicon';
import { Chip, Kicker } from '../components/bits';
import { useNav, useQuery, useRepo } from '../context';

type Mode = 'type' | 'proposals';

export function AddScreen() {
  const [mode, setMode] = useState<Mode>('type');
  const muted = 'var(--color-muted)';
  return (
    <div>
      <div className="dsh hstack" style={{ gap: 20, alignItems: 'baseline', padding: '8px 0 18px', fontSize: 15 }}>
        <span className="row" style={{ color: mode === 'type' ? 'var(--color-accent)' : muted }} onClick={() => setMode('type')}>
          Type a list
        </span>
        <span className="row" style={{ color: mode === 'proposals' ? 'var(--color-accent)' : muted }} onClick={() => setMode('proposals')}>
          Proposals
        </span>
      </div>
      {mode === 'type' ? <TypeMode /> : <ProposalsMode />}
    </div>
  );
}

function TypeMode() {
  const repo = useRepo();
  const nav = useNav();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const lines = useMemo(
    () =>
      text
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => ({ raw: l, parsed: parseDishName(l, repo.lex) })),
    [text, repo.lex],
  );
  const unknown = lines.filter((l) => !l.parsed.ingredients.length && !l.parsed.form).length;
  const save = async () => {
    if (!lines.length) return;
    setSaving(true);
    await repo.createFromLines(lines.map((l) => l.raw));
    setSaving(false);
    setText('');
    nav.setTab('dishes');
  };
  return (
    <div>
      <div className="dsh" style={{ fontSize: 26, letterSpacing: '-0.02em', marginBottom: 4 }}>
        One dish per line
      </div>
      <div className="mut" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Names only. Ingredients and effort come from the name. Add #tags inline if you like.
      </div>
      <textarea
        className="input"
        style={{ minHeight: 150, fontSize: 16, lineHeight: 1.7 }}
        placeholder={'Spinach aloo paratha\nBeans paruppu usili\nVazhakkai varuval #quick\nEgg curry'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoCapitalize="sentences"
        autoCorrect="off"
      />
      {lines.length > 0 && (
        <div style={{ fontSize: 13, lineHeight: 2, marginTop: 14 }}>
          {lines.map((l, i) => (
            <div key={i} className="hstack" style={{ gap: 5, flexWrap: 'wrap' }}>
              {l.parsed.name}
              {l.parsed.ingredients.map((ing) => (
                <Chip key={ing.name} neutral>
                  {ing.name}
                </Chip>
              ))}
              {l.parsed.form && <Chip neutral>{l.parsed.form.label.toLowerCase()}</Chip>}
              {l.parsed.tags.map((t) => (
                <Chip key={t} on>
                  #{t}
                </Chip>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="mut" style={{ fontSize: 12, marginTop: 12 }}>
        {lines.length
          ? `${lines.length} ${lines.length === 1 ? 'dish' : 'dishes'} · ${unknown} not in the lexicon, saved as typed`
          : 'Type what you actually cook. Forgotten ones will come back as proposals.'}
      </div>
      <button type="button" className="btn btn-primary btn-block" disabled={!lines.length || saving} onClick={() => void save()}>
        Save to Dishes
      </button>
    </div>
  );
}

function ProposalsMode() {
  const repo = useRepo();
  const [page, setPage] = useState(0);
  const { data } = useQuery((r) => r.proposals(10));
  const { data: dishCount } = useQuery((r) => r.dishCount());
  const proposals: Proposal[] = data?.proposals ?? [];
  const current = proposals[0];
  const answer = async (a: 'yes' | 'never' | 'no') => {
    if (!current) return;
    await repo.answerProposal(current, a);
    setPage((p) => (p + 1) % 10);
  };
  if (!data) return null;
  if (!current) {
    return (
      <div className="empty">
        <div className="dsh">{dishCount ? 'Nothing left to propose.' : 'Type a few dishes first.'}</div>
        <p className="mut" style={{ fontSize: 13 }}>
          {dishCount
            ? 'Proposals are built from your ingredients, forms and bases. Add more dishes and new combinations appear.'
            : 'Proposals are built from what you already make — the ingredients and forms in your own dish names.'}
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="mut" style={{ fontSize: 12, marginBottom: 40 }}>
        {page + 1} of 10 · {data.answered} answered so far
      </div>
      <div style={{ marginBottom: 36 }}>
        <Kicker>{current.from}</Kicker>
        <div className="dsh" style={{ fontSize: 38, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
          {current.name}
        </div>
      </div>
      <div className="stack" style={{ gap: 10, marginBottom: 40 }}>
        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 0 }} onClick={() => void answer('yes')}>
          Yes, I make this
        </button>
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 0 }} onClick={() => void answer('never')}>
          Never tried it
        </button>
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => void answer('no')}>
          No — don't offer again
        </button>
      </div>
      <Kicker ink style={{ marginBottom: 10 }}>
        Coming up
      </Kicker>
      <div className="dsh stack" style={{ gap: 9, fontSize: 18, opacity: 0.4 }}>
        {proposals.slice(1, 5).map((p) => (
          <div key={p.key}>{p.name}</div>
        ))}
      </div>
    </div>
  );
}
