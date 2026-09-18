import { useEffect, useRef, useState } from 'react';
import { relativeDate } from '../../domain/clock';
import { BackButton, Chip, Kicker, Sheet } from '../components/bits';
import { useQuery, useRepo } from '../context';

export function SettingsScreen() {
  const repo = useRepo();
  const { data } = useQuery(async (r) => {
    const [staples, fresh, settings, lastExport, totals] = await Promise.all([r.staples(), r.freshIngredients(), r.settings(), r.setting('last_export_at'), r.totals()]);
    return { staples, fresh, settings, lastExport, totals };
  });
  const [addingStaple, setAddingStaple] = useState(false);
  const [allStaples, setAllStaples] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  if (!data) return null;
  const { staples, fresh, settings, lastExport, totals } = data;
  const setNum = (key: string) => (e: React.ChangeEvent<HTMLSelectElement>) => void repo.setSetting(key, e.target.value);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const onImport = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm('Replace everything in Akku with this file? Export first if you are unsure.')) return;
    await run('import', () => repo.importSqlite(file));
  };

  return (
    <div>
      <div className="between" style={{ padding: '8px 0 22px', fontSize: 13 }}>
        <BackButton />
        <span className="mut">Akku v1</span>
      </div>
      <div className="dsh title" style={{ marginBottom: 28 }}>
        Settings
      </div>

      <Kicker>Staples — never shown as missing</Kicker>
      <div className="wrap" style={{ marginBottom: 8 }}>
        {(allStaples ? staples : staples.slice(0, 18)).map((s) => (
          <Chip key={s.id} neutral onClick={() => void repo.setIngredientKind(s.id, 'fresh')} title="Tap to make it fresh">
            {cap(s.name)}
          </Chip>
        ))}
        {!allStaples && staples.length > 18 && <Chip onClick={() => setAllStaples(true)}>all {staples.length}…</Chip>}
        <Chip onClick={() => setAddingStaple(true)}>+ add</Chip>
      </div>
      <div className="mut" style={{ fontSize: 12, marginBottom: 30 }}>
        Everything else is fresh, and decays. Tap a staple to move it back to fresh.
      </div>

      <Kicker style={{ marginBottom: 12 }}>Decay windows</Kicker>
      <div className="stack" style={{ gap: 13, marginBottom: 30 }}>
        <div className="setting-row">
          <span>Fresh chip expires after</span>
          <select value={settings.freshDays} onChange={setNum('fresh_days')}>
            {[3, 5, 7, 10, 14].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <span>Suppress after cooking</span>
          <select value={settings.suppressDays} onChange={setNum('suppress_days')}>
            {[2, 3, 5, 7, 10].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <span>Forgotten after</span>
          <select value={settings.forgottenDays} onChange={setNum('forgotten_days')}>
            {[30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <span>Relax effort at weekends</span>
          <select value={settings.weekendRelax ? '1' : '0'} onChange={setNum('weekend_relax')}>
            <option value="1">on</option>
            <option value="0">off</option>
          </select>
        </div>
      </div>

      <Kicker style={{ marginBottom: 12 }}>Your database</Kicker>
      <div className="hstack" style={{ gap: 10, marginBottom: 8 }}>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void run('sqlite', () => repo.exportSqlite())}>
          Export .sqlite
        </button>
        <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => void run('json', () => repo.exportJson())}>
          Export JSON
        </button>
      </div>
      <div className="mut" style={{ fontSize: 12, marginBottom: 16 }}>
        {lastExport ? `Last export ${relativeDate(lastExport)}` : 'Never exported'} · {totals.dishes} {totals.dishes === 1 ? 'dish' : 'dishes'}, {totals.cooks} {totals.cooks === 1 ? 'cook' : 'cooks'}. Export is the backup; nothing syncs.
      </div>
      <button type="button" className="link" style={{ fontSize: 13, paddingBottom: 10 }} disabled={!!busy} onClick={() => fileRef.current?.click()}>
        Import a database file
      </button>
      <input ref={fileRef} type="file" accept=".sqlite,.sqlite3,.db,application/octet-stream" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
      <div className="mut" style={{ fontSize: 12, marginTop: 16 }}>
        {persisted === true ? 'Storage is persistent on this device.' : persisted === false ? 'Storage is not yet marked persistent — add Akku to your home screen and export regularly.' : ''}
      </div>
      <div className="mut" style={{ fontSize: 12, marginTop: 8 }}>
        Open Akku from the home screen icon, not Safari — Safari writes to a different copy of your database.
      </div>

      {addingStaple && (
        <Sheet onClose={() => setAddingStaple(false)} title="Make a staple">
          <div className="mut meta" style={{ marginBottom: 12 }}>
            A staple is something you always have. It never shows as missing.
          </div>
          <div className="wrap">
            {fresh.map((f) => (
              <Chip
                key={f.id}
                onClick={async () => {
                  await repo.setIngredientKind(f.id, 'staple');
                }}
              >
                {cap(f.name)}
              </Chip>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
