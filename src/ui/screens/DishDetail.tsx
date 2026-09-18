import { useEffect, useRef, useState } from 'react';
import { relativeDate, shortDate } from '../../domain/clock';
import { historyLine, subLine } from '../../domain/present';
import { BackButton, Chip, Kicker, Sheet } from '../components/bits';
import { useNav, useQuery, useRepo, useUndo } from '../context';

export function DishDetailScreen({ id }: { id: number }) {
  const repo = useRepo();
  const nav = useNav();
  const undo = useUndo();
  const { data: view } = useQuery((r) => r.detail(id), [id]);
  const { data: allTags } = useQuery((r) => r.tags());
  const { data: pantry } = useQuery((r) => r.pantryHave());
  const { data: pinnedCount } = useQuery((r) => r.pinnedCount());

  const [notes, setNotes] = useState<string | null>(null);
  const [tweak, setTweak] = useState('');
  const [showTweak, setShowTweak] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [showNewTag, setShowNewTag] = useState(false);
  const [addition, setAddition] = useState('');
  const [showAddition, setShowAddition] = useState(false);
  const [showBasePicker, setShowBasePicker] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const tweakRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showTweak) tweakRef.current?.focus();
  }, [showTweak]);

  if (!view) return null;
  const { facts: f, why, base, siblings, children, versions, history } = view;
  const d = f.dish;
  const isRetired = d.status === 'retired';
  const pantryNames = new Set((pantry ?? []).map((p) => p.name));
  const missing = pantry && pantry.length ? f.ingredients.filter((i) => i.kind === 'fresh' && !pantryNames.has(i.name)) : [];
  const tweaks = f.currentVersion?.tweaks ?? [];
  const suggestions = (allTags ?? []).filter((t) => !f.tags.includes(t.name)).slice(0, 5);
  const notesValue = notes ?? d.notes;
  const notesDirty = notes !== null && notes !== d.notes;

  const cook = async () => {
    const receipt = await repo.cook(d.id);
    undo.show(receipt);
    nav.setTab('home');
  };
  const saveTweak = async () => {
    if (!tweak.trim()) return;
    await repo.addTweak(d.id, tweak);
    setTweak('');
    setShowTweak(false);
  };
  const saveNotes = async () => {
    await repo.updateNotes(d.id, notesValue.trim());
    setNotes(null);
  };
  const addNewTag = async () => {
    if (!newTag.trim()) return;
    await repo.addTag(d.id, newTag);
    setNewTag('');
    setShowNewTag(false);
  };
  const addVariation = async () => {
    if (!addition.trim()) return;
    const vid = await repo.addVariation(d.id, addition);
    setAddition('');
    setShowAddition(false);
    nav.go({ name: 'detail', id: vid });
  };

  return (
    <div>
      <div className="between" style={{ padding: '8px 0 20px', fontSize: 13 }}>
        <BackButton />
        <span className="hstack" style={{ gap: 14 }}>
          {!isRetired && (
            <button type="button" className="link" onClick={() => void repo.setPinned(d.id, !d.pinned)}>
              {d.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          <button type="button" className="link" style={{ color: 'var(--color-accent-2-700)' }} onClick={() => void (isRetired ? repo.bringBack(d.id) : repo.retire(d.id))}>
            {isRetired ? 'Bring back' : 'Retire'}
          </button>
        </span>
      </div>

      {renaming !== null ? (
        <div className="hstack" style={{ gap: 8 }}>
          <input
            className="input dsh"
            style={{ fontSize: 22 }}
            value={renaming}
            autoFocus
            onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renaming.trim()) {
                void repo.rename(d.id, renaming);
                setRenaming(null);
              }
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
          <button
            type="button"
            className="btn btn-primary fixed"
            disabled={!renaming.trim()}
            onClick={() => {
              void repo.rename(d.id, renaming);
              setRenaming(null);
            }}
          >
            Save
          </button>
        </div>
      ) : (
        <div className="dsh dish-name row" onClick={() => setRenaming(d.name)} title="Tap to rename">
          {d.name}
        </div>
      )}
      <div className="mut" style={{ fontSize: 13, margin: '6px 0 20px' }}>
        {subLine(f, base?.name ?? null, view.formLabel, view.minutes, children.length)}
        {renaming === null && (
          <>
            {' · '}
            <button type="button" className="link mut" style={{ fontSize: 'inherit' }} onClick={() => setRenaming(d.name)}>
              rename
            </button>
          </>
        )}
      </div>
      {(d.pinned || isRetired) && (
        <Kicker warn style={{ margin: '-12px 0 20px' }}>
          {isRetired ? 'Retired · not suggested, still searchable' : 'Pinned · kept near the top of suggestions'}
        </Kicker>
      )}
      {d.pinned && (pinnedCount ?? 0) > 10 && (
        <div className="mut meta" style={{ margin: '-12px 0 20px' }}>
          {pinnedCount} pinned. Past ten or so, pins stop carrying information.
        </div>
      )}

      <Kicker style={{ marginBottom: 7 }}>Tags</Kicker>
      <div className="wrap" style={{ marginBottom: 7 }}>
        {f.tags.map((t) => (
          <Chip key={t} on onClick={() => void repo.removeTag(d.id, t)} title="Remove tag">
            {t}&nbsp;&nbsp;×
          </Chip>
        ))}
        {!f.tags.length && <span className="mut meta">No tags — a tag is a word you may invent.</span>}
      </div>
      <div className="wrap" style={{ marginBottom: 24 }}>
        {suggestions.map((t) => (
          <Chip key={t.id} onClick={() => void repo.addTag(d.id, t.name)} title="Add tag">
            + {t.name}
          </Chip>
        ))}
        {showNewTag ? (
          <input
            className="input"
            style={{ width: 140, minHeight: 26, padding: '2px 8px', fontSize: 13 }}
            placeholder="new tag"
            value={newTag}
            autoFocus
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addNewTag()}
            onBlur={() => void addNewTag()}
          />
        ) : (
          <Chip onClick={() => setShowNewTag(true)}>+ new</Chip>
        )}
      </div>

      <Kicker style={{ marginBottom: 7 }}>Ingredients</Kicker>
      <div style={{ fontSize: 14, lineHeight: 1.75, marginBottom: 24 }}>
        {f.ingredients.length ? (
          <IngredientEditor names={f.ingredients.filter((i) => !i.inherited).map((i) => i.name)} inherited={f.ingredients.filter((i) => i.inherited).map((i) => i.name)} baseName={base?.name ?? null} onSave={(names) => void repo.setIngredients(d.id, names)} />
        ) : (
          <IngredientEditor names={[]} inherited={[]} baseName={null} onSave={(names) => void repo.setIngredients(d.id, names)} />
        )}
        {missing.length > 0 && <div className="warn">{missing.map((m) => cap(m.name)).join(', ')} — not in the fridge</div>}
      </div>

      <Kicker style={{ marginBottom: 7 }}>How you make it</Kicker>
      {tweaks.length ? (
        <ol className="tweak-list">
          {tweaks.map((t, i) => (
            <li key={i}>
              {t}{' '}
              <button type="button" className="link mut" style={{ fontSize: 11 }} onClick={() => void repo.removeTweak(d.id, i)} title="Remove this line (makes a new version)">
                ×
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mut" style={{ fontSize: 14, marginBottom: 22 }}>
          No tweaks yet — notes on how you make it appear here.
        </div>
      )}
      {showTweak && (
        <div className="hstack" style={{ gap: 8, marginBottom: 18 }}>
          <input ref={tweakRef} className="input" placeholder="One line — less oil, more tomato" value={tweak} onChange={(e) => setTweak(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveTweak()} />
          <button type="button" className="btn btn-primary fixed" onClick={() => void saveTweak()}>
            Add
          </button>
        </div>
      )}
      <div className="mut" style={{ fontSize: 12, marginBottom: 26 }}>
        {historyLine(f, why)}
      </div>

      <Kicker style={{ marginBottom: 9 }}>Notes</Kicker>
      <textarea
        className="input"
        style={{ minHeight: 62, fontSize: 15, lineHeight: 1.6, marginBottom: 9 }}
        placeholder="Anything about the dish — mum's version, good for guests, serve with plain rice"
        value={notesValue}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="hstack" style={{ gap: 12, marginBottom: 28 }}>
        <button type="button" className="btn btn-secondary fixed nowrap" disabled={!notesDirty} onClick={() => void saveNotes()}>
          Save note
        </button>
        <span className="mut meta">{notesDirty ? 'Saved against this dish only.' : d.notesUpdatedAt ? `Edited ${relativeDate(d.notesUpdatedAt)}. Notes show up in search.` : 'Notes stay with the dish and show up in search.'}</span>
      </div>

      {!isRetired && (
        <div className="hstack" style={{ gap: 10, marginBottom: 30 }}>
          <button type="button" className="btn btn-primary" onClick={() => void cook()}>
            Cook this
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void repo.setNextUp(d.id)}>
            Next up
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowTweak(true)}>
            Note a tweak
          </button>
        </div>
      )}

      <div className="stack" style={{ gap: 14, fontSize: 13, paddingBottom: 10 }}>
        {base && (
          <>
            <button type="button" className="link" style={{ textAlign: 'left' }} onClick={() => nav.go({ name: 'detail', id: base.id })}>
              Built on your {base.name.toLowerCase()}
            </button>
            {siblings.length > 0 && (
              <div className="wrap">
                {siblings.map((s) => (
                  <Chip key={s.id} onClick={() => nav.go({ name: 'detail', id: s.id })}>
                    {s.name}
                  </Chip>
                ))}
              </div>
            )}
            <button type="button" className="link mut" style={{ textAlign: 'left' }} onClick={() => void repo.setBase(d.id, null)}>
              Unlink from the base (keeps its ingredients)
            </button>
          </>
        )}
        {children.length > 0 && (
          <button type="button" className="link" style={{ textAlign: 'left' }} onClick={() => nav.go({ name: 'variations', id: d.id })}>
            Variations of {d.name.toLowerCase()} — {children.length}
          </button>
        )}
        {(d.isBase || children.length > 0) &&
          (showAddition ? (
            <div className="hstack" style={{ gap: 8 }}>
              <input className="input" placeholder="Just the addition — mushroom" value={addition} autoFocus onChange={(e) => setAddition(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addVariation()} />
              <button type="button" className="btn btn-primary fixed" onClick={() => void addVariation()}>
                Add
              </button>
            </div>
          ) : (
            <button type="button" className="link" style={{ textAlign: 'left' }} onClick={() => setShowAddition(true)}>
              Add a variation
            </button>
          ))}
        {!base && (
          <button type="button" className="link mut" style={{ textAlign: 'left' }} onClick={() => setShowBasePicker(true)}>
            Built on… (link to a base)
          </button>
        )}
        <label className="hstack mut" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={d.isBase} onChange={(e) => void repo.markBase(d.id, e.target.checked)} />
          This is a base preparation
        </label>
        <button type="button" className="link mut" style={{ textAlign: 'left' }} onClick={() => setShowVersions((v) => !v)}>
          Version history — {versions.length}
        </button>
        {showVersions && (
          <div className="stack" style={{ gap: 10, paddingLeft: 12, borderLeft: '1px solid var(--color-divider)' }}>
            {versions.map((v) => (
              <div key={v.id}>
                <div className="meta">
                  Version {v.n}
                  {v.isCurrent ? ' · current' : ''} · {shortDate(v.createdAt)}
                </div>
                {v.tweaks.length ? (
                  <ol style={{ paddingLeft: 16, fontSize: 12.5, margin: 0 }}>
                    {v.tweaks.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ol>
                ) : (
                  <div className="mut meta">The original — no tweaks.</div>
                )}
              </div>
            ))}
          </div>
        )}
        <button type="button" className="link mut" style={{ textAlign: 'left' }} onClick={() => setShowHistory((v) => !v)}>
          Every cook — {history.length}
        </button>
        {showHistory && (
          <div className="stack" style={{ gap: 6, paddingLeft: 12, borderLeft: '1px solid var(--color-divider)', fontSize: 12.5 }}>
            {history.map((h) => (
              <div key={h.id}>
                {shortDate(h.cookedAt)} · {h.mealSlot}
              </div>
            ))}
            {!history.length && <div className="mut meta">Never cooked.</div>}
          </div>
        )}
      </div>

      {showBasePicker && <BasePicker excludeId={d.id} onPick={(baseId) => void repo.setBase(d.id, baseId)} onClose={() => setShowBasePicker(false)} />}
    </div>
  );
}

function IngredientEditor({ names, inherited, baseName, onSave }: { names: string[]; inherited: string[]; baseName: string | null; onSave: (names: string[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(names.join(', '));
  if (editing) {
    return (
      <div className="hstack" style={{ gap: 8 }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="comma-separated" autoFocus />
        <button
          type="button"
          className="btn btn-primary fixed"
          onClick={() => {
            onSave(text.split(',').map((s) => s.trim()).filter(Boolean));
            setEditing(false);
          }}
        >
          Save
        </button>
      </div>
    );
  }
  return (
    <div>
      <span>{names.map(cap).join(', ') || <span className="mut">No ingredients read from the name.</span>}</span>{' '}
      <button
        type="button"
        className="link mut"
        style={{ fontSize: 11 }}
        onClick={() => {
          setText(names.join(', '));
          setEditing(true);
        }}
      >
        edit
      </button>
      {inherited.length > 0 && (
        <div className="mut" style={{ fontSize: 12.5 }}>
          + {inherited.map(cap).join(', ')} from {baseName ? `your ${baseName.toLowerCase()}` : 'the base'}
        </div>
      )}
    </div>
  );
}

function BasePicker({ excludeId, onPick, onClose }: { excludeId: number; onPick: (id: number) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const { data: facts } = useQuery((r) => r.loadFacts());
  const query = q.trim().toLowerCase();
  const list = facts
    ? [...facts.values()]
        .map((f) => f.dish)
        .filter((d) => d.id !== excludeId && d.status !== 'retired' && (!query || d.name.toLowerCase().includes(query)))
        .sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.name.localeCompare(b.name))
        .slice(0, 40)
    : [];
  return (
    <Sheet onClose={onClose} title="Built on…">
      <input className="input" placeholder="Which dish is the base?" value={q} onChange={(e) => setQ(e.target.value)} autoFocus style={{ marginBottom: 14 }} />
      <div className="stack" style={{ gap: 12 }}>
        {list.map((d) => (
          <div
            key={d.id}
            className="dsh row"
            style={{ fontSize: 18 }}
            onClick={() => {
              onPick(d.id);
              onClose();
            }}
          >
            {d.name}
            {d.isBase && <span className="mut meta"> · base</span>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
