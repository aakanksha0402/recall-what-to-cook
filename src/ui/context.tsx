import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CookReceipt, Repo } from '../repo/repo';

// ── repo ──────────────────────────────────────────────────────────────────

const RepoContext = createContext<Repo | null>(null);

export function RepoProvider({ repo, children }: { repo: Repo; children: ReactNode }) {
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}

export function useRepo(): Repo {
  const r = useContext(RepoContext);
  if (!r) throw new Error('RepoProvider missing');
  return r;
}

/** Runs a repo query and re-runs it whenever the repo reports a change. */
export function useQuery<T>(fn: (repo: Repo) => Promise<T>, deps: unknown[] = []): { data: T | undefined; reload: () => void; loading: boolean } {
  const repo = useRepo();
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => repo.subscribe(() => setTick((n) => n + 1)), [repo]);
  useEffect(() => {
    let live = true;
    fnRef
      .current(repo)
      .then((d) => {
        if (live) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => console.error(e));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, tick, ...deps]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, reload, loading };
}

// ── navigation ────────────────────────────────────────────────────────────

export type Tab = 'home' | 'add' | 'dishes';
export type Screen =
  | { name: 'home' }
  | { name: 'add' }
  | { name: 'dishes' }
  | { name: 'search' }
  | { name: 'settings' }
  | { name: 'detail'; id: number }
  | { name: 'variations'; id: number };

interface Nav {
  current: Screen;
  tab: Tab;
  go: (s: Screen) => void;
  back: () => void;
  setTab: (t: Tab) => void;
}

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Screen[]>([{ name: 'home' }]);
  const nav = useMemo<Nav>(() => {
    const current = stack[stack.length - 1]!;
    const root = stack[0]!;
    const tab: Tab = root.name === 'add' ? 'add' : root.name === 'dishes' ? 'dishes' : 'home';
    return {
      current,
      tab,
      go: (s) => setStack((st) => [...st, s]),
      back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : [{ name: 'home' }])),
      setTab: (t) => setStack([{ name: t }]),
    };
  }, [stack]);
  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('NavProvider missing');
  return n;
}

// ── undo strip ────────────────────────────────────────────────────────────

interface Undo {
  receipt: CookReceipt | null;
  show: (r: CookReceipt) => void;
  undo: () => void;
  dismiss: () => void;
}

const UndoContext = createContext<Undo | null>(null);
const UNDO_MS = 6000;

export function UndoProvider({ children }: { children: ReactNode }) {
  const repo = useRepo();
  const [receipt, setReceipt] = useState<CookReceipt | null>(null);
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const dismiss = useCallback(() => {
    clear();
    setReceipt(null);
  }, [clear]);
  const show = useCallback(
    (r: CookReceipt) => {
      clear();
      setReceipt(r);
      timer.current = window.setTimeout(() => setReceipt(null), UNDO_MS);
    },
    [clear],
  );
  const undo = useCallback(() => {
    if (!receipt) return;
    dismiss();
    void repo.undoCook(receipt);
  }, [receipt, dismiss, repo]);
  useEffect(() => clear, [clear]);
  const value = useMemo(() => ({ receipt, show, undo, dismiss }), [receipt, show, undo, dismiss]);
  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

export function useUndo(): Undo {
  const u = useContext(UndoContext);
  if (!u) throw new Error('UndoProvider missing');
  return u;
}
