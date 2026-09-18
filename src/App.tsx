import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { openDb, requestPersistence } from './db/client';
import type { Plausibility } from './domain/expansion';
import { buildIndex, type Lexicon } from './domain/lexicon';
import { Repo } from './repo/repo';
import lexiconJson from './seed/lexicon.json';
import plausibilityJson from './seed/plausibility.json';
import { NavProvider, RepoProvider, UndoProvider } from './ui/context';
import { Shell } from './ui/Shell';

type Boot = { repo: Repo } | { error: string } | null;

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

export function App() {
  const [boot, setBoot] = useState<Boot>(null);
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    updateSW = registerSW({ onNeedRefresh: () => setNeedRefresh(true) });
    (async () => {
      if (!window.isSecureContext || !navigator.storage?.getDirectory) {
        throw new Error(
          'The browser only unlocks on-device storage on a secure page. Open Akku over HTTPS (or on localhost) — not via a plain http:// address.',
        );
      }
      const db = openDb();
      const repo = new Repo(db, buildIndex(lexiconJson as unknown as Lexicon), plausibilityJson as unknown as Plausibility);
      await repo.boot();
      await requestPersistence();
      if (import.meta.env.DEV) {
        (window as unknown as { __akku: Repo }).__akku = repo;
        if (new URLSearchParams(location.search).has('demo')) {
          const { seedDemo } = await import('./seed/demo');
          await seedDemo(repo);
        }
      }
      setBoot({ repo });
    })().catch((e: unknown) => {
      console.error(e);
      setBoot({ error: e instanceof Error ? e.message : String(e) });
    });
  }, []);

  if (!boot) return <Splash text="Opening your database…" />;
  if ('error' in boot) return <Splash text={`Akku could not open its database. ${boot.error}`} warn />;
  return (
    <RepoProvider repo={boot.repo}>
      <UndoProvider>
        <NavProvider>
          <Shell needRefresh={needRefresh} onRefresh={() => void updateSW?.(true)} />
        </NavProvider>
      </UndoProvider>
    </RepoProvider>
  );
}

function Splash({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <div className="app">
      <div className="phone">
        <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
          <div className={warn ? 'warn' : 'mut'} style={{ fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}
