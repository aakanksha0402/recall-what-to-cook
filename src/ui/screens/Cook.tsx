import { useState } from 'react';
import { dayLabel, mealSlotFor } from '../../domain/clock';
import type { MealSlot } from '../../domain/types';
import { Chip, Empty, Kicker } from '../components/bits';
import { GearIcon, SearchIcon } from '../components/icons';
import { useNav, useQuery, useRepo, useUndo } from '../context';
import { NextUpPicker } from './NextUpPicker';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export function CookScreen() {
  const repo = useRepo();
  const nav = useNav();
  const undo = useUndo();
  const [slotOverride, setSlotOverride] = useState<MealSlot | null>(null);
  const [picking, setPicking] = useState(false);
  const now = new Date();
  const slot = slotOverride ?? mealSlotFor(now);
  const { data: home } = useQuery((r) => r.home(new Date(), slot), [slot]);
  const { data: dishCount } = useQuery((r) => r.dishCount());

  const cycleSlot = () => setSlotOverride(SLOTS[(SLOTS.indexOf(slot) + 1) % SLOTS.length]!);
  const cook = async (id: number) => {
    const receipt = await repo.cook(id);
    undo.show(receipt);
  };

  const haveCount = home?.chips.filter((c) => c.have).length ?? 0;
  const lead = home?.lead ?? null;

  return (
    <div>
      <div className="header">
        <button type="button" className="header-label" onClick={cycleSlot} title="Tap to change the meal">
          {dayLabel(now, slot)}
        </button>
        <div className="hstack" style={{ gap: 14 }}>
          <button type="button" className="icon-btn" onClick={() => nav.go({ name: 'search' })} aria-label="Search">
            <SearchIcon />
          </button>
          <button type="button" className="icon-btn" onClick={() => nav.go({ name: 'settings' })} aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </div>

      {home?.nextUp && (
        <div className="between" style={{ marginTop: -12, marginBottom: 22, fontSize: 13 }}>
          <span className="row" onClick={() => nav.go({ name: 'detail', id: home.nextUp!.id })}>
            <span className="k" style={{ marginRight: 8 }}>
              Next up
            </span>
            <span className="dsh">{home.nextUp.name}</span>
          </span>
        </div>
      )}

      {dishCount === 0 ? (
        <Empty
          title="Nothing to suggest yet."
          body="Akku only suggests what you already cook. Start with a brain dump — one dish per line, names only."
          action="Type your dishes"
          onAction={() => nav.setTab('add')}
        />
      ) : (
        <>
          <div className="section">
            <Kicker>I have…</Kicker>
            <div className="wrap">
              {home?.chips.map((c) => (
                <Chip key={c.id} on={c.have} onClick={() => void repo.togglePantry(c.id)}>
                  {cap(c.name)}
                </Chip>
              ))}
            </div>
            <div className="mut meta" style={{ marginTop: 8 }}>
              {haveCount ? `Ranking re-run on ${haveCount} fresh ${haveCount === 1 ? 'ingredient' : 'ingredients'}.` : 'Nothing fresh — ranking falls back to rhythm and effort.'}
            </div>
          </div>

          {lead ? (
            <>
              <div className="row" onClick={() => nav.go({ name: 'detail', id: lead.dish.id })}>
                <Kicker style={{ marginBottom: 6 }}>{lead.reason}</Kicker>
                <div className="dsh suggest-name">{lead.dish.name}</div>
                <div className="mut" style={{ fontSize: 13, marginBottom: 16 }}>
                  {lead.meta}
                </div>
              </div>
              <div className="hstack" style={{ gap: 10, marginBottom: 34 }}>
                <button type="button" className="btn btn-primary" onClick={() => void cook(lead.dish.id)}>
                  Cook this
                </button>
                <button type="button" className="btn btn-secondary nowrap" onClick={() => void repo.setNextUp(lead.dish.id)}>
                  Next up
                </button>
                <button type="button" className="btn btn-ghost nowrap" onClick={() => void repo.notTonight(lead.dish.id)}>
                  Not tonight
                </button>
              </div>

              <div className="stack" style={{ gap: 19, marginBottom: 30 }}>
                {home!.alternates.map((a) => (
                  <div key={a.dish.id} className="row" onClick={() => nav.go({ name: 'detail', id: a.dish.id })}>
                    <div className="dsh alt-name">{a.dish.name}</div>
                    <div className="mut" style={{ fontSize: 12 }}>
                      {a.reason}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            home && (
              <Empty
                title="Nothing eligible right now."
                body="Everything is either cooked in the last few days, in a rut, or parked. Add a few more dishes, or pick one by hand."
                action="Pick a dish"
                onAction={() => setPicking(true)}
              />
            )
          )}

          <div className="section">
            <Kicker style={{ marginBottom: 9 }}>{home?.nextUp ? `Next up · ${nextWhen(slot)}` : 'Next up'}</Kicker>
            {home?.nextUp ? (
              <>
                <div className="between">
                  <span className="dsh row" style={{ fontSize: 18 }} onClick={() => nav.go({ name: 'detail', id: home.nextUp!.id })}>
                    {home.nextUp.name}
                  </span>
                  <span className="hstack fixed" style={{ gap: 14, fontSize: 11.5 }}>
                    <button type="button" className="link" onClick={() => void cook(home.nextUp!.id)}>
                      Cook this
                    </button>
                    <button type="button" className="link mut" onClick={() => void repo.clearNextUp()}>
                      Clear
                    </button>
                  </span>
                </div>
                <div className="mut meta" style={{ marginTop: 9 }}>
                  One parked decision. Setting another replaces it.
                </div>
              </>
            ) : (
              <div className="mut meta">
                Nothing parked.{' '}
                <button type="button" className="link" style={{ fontSize: 'inherit' }} onClick={() => setPicking(true)}>
                  Pick a dish…
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {picking && <NextUpPicker onClose={() => setPicking(false)} />}
    </div>
  );
}

function nextWhen(slot: MealSlot): string {
  return slot === 'dinner' ? 'tomorrow' : 'later today';
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
