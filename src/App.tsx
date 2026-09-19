import { useEffect, useState, type ReactNode } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useSession } from './auth/session';
import type { Plausibility } from './domain/expansion';
import { buildIndex, type Lexicon } from './domain/lexicon';
import { supabase, supabaseConfigured } from './lib/supabase';
import { Repo } from './repo/repo';
import lexiconJson from './seed/lexicon.json';
import plausibilityJson from './seed/plausibility.json';
import { NavProvider, RepoProvider, UndoProvider } from './ui/context';
import { LoginScreen } from './ui/screens/Login';
import { Shell } from './ui/Shell';

type Boot = { repo: Repo } | { error: string } | null;

const lexicon = buildIndex(lexiconJson as unknown as Lexicon);
const plausibility = plausibilityJson as unknown as Plausibility;

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

export function App() {
  const session = useSession();
  const [boot, setBoot] = useState<Boot>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    updateSW = registerSW({ onNeedRefresh: () => setNeedRefresh(true) });
  }, []);

  useEffect(() => {
    if (!userId) {
      setBoot(null);
      return;
    }
    let live = true;
    (async () => {
      const repo = new Repo(supabase, lexicon, plausibility);
      await repo.boot();
      if (import.meta.env.DEV) {
        (window as unknown as { __akku: Repo }).__akku = repo;
        if (new URLSearchParams(location.search).has('demo')) {
          const { seedDemo } = await import('./seed/demo');
          await seedDemo(repo);
        }
      }
      if (live) setBoot({ repo });
    })().catch((e: unknown) => {
      console.error(e);
      if (live) setBoot({ error: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      live = false;
    };
  }, [userId, attempt]);

  if (!supabaseConfigured) return <Splash text="Akku is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are missing." warn />;
  if (session === undefined) return <Splash text="Opening…" />;
  if (session === null) return <LoginScreen />;
  if (!boot) return <Splash text="Loading your dishes…" />;
  if ('error' in boot)
    return (
      <Splash text={`Akku could not load your data. ${boot.error}`} warn>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 16 }}
          onClick={() => {
            setBoot(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </Splash>
    );
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

function Splash({ text, warn, children }: { text: string; warn?: boolean; children?: ReactNode }) {
  return (
    <div className="app">
      <div className="phone">
        <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 280 }}>
            <div className={warn ? 'warn' : 'mut'} style={{ fontSize: 13 }}>
              {text}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
