import { useEffect, useState } from 'react';
import { useNav, useUndo } from './context';
import { AddScreen } from './screens/Add';
import { CookScreen } from './screens/Cook';
import { DishDetailScreen } from './screens/DishDetail';
import { DishesScreen } from './screens/Dishes';
import { SearchScreen } from './screens/Search';
import { SettingsScreen } from './screens/Settings';
import { VariationsScreen } from './screens/Variations';

export function Shell({ needRefresh, onRefresh }: { needRefresh: boolean; onRefresh: () => void }) {
  const nav = useNav();
  const undo = useUndo();
  const fault = useFaultStrip();
  const s = nav.current;
  const showTabBar = s.name !== 'search' && s.name !== 'settings';

  let screen;
  switch (s.name) {
    case 'home':
      screen = <CookScreen />;
      break;
    case 'dishes':
      screen = <DishesScreen />;
      break;
    case 'add':
      screen = <AddScreen />;
      break;
    case 'search':
      screen = <SearchScreen />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    case 'detail':
      screen = <DishDetailScreen key={s.id} id={s.id} />;
      break;
    case 'variations':
      screen = <VariationsScreen key={s.id} id={s.id} />;
      break;
  }

  return (
    <div className="app">
      <div className="phone">
        <div className="screen" key={screenKey(s)}>
          <div className="screen-inner">{screen}</div>
        </div>
        {undo.receipt && (
          <div className="undo">
            <span>
              Logged {undo.receipt.dish.name} for {mealWord()}.
            </span>
            <button type="button" className="link" onClick={undo.undo}>
              Undo
            </button>
          </div>
        )}
        {fault.message && (
          <div className="undo" style={{ background: 'var(--color-accent-2-100)' }}>
            <span className="warn">Could not save — {fault.message}</span>
            <button type="button" className="link" style={{ color: 'var(--color-accent-2-700)' }} onClick={fault.dismiss}>
              Dismiss
            </button>
          </div>
        )}
        {needRefresh && (
          <div className="undo" style={{ background: 'var(--color-surface)' }}>
            <span>A new version of Akku is ready.</span>
            <button type="button" className="link" onClick={onRefresh}>
              Reload
            </button>
          </div>
        )}
        {showTabBar && (
          <nav className="tabbar">
            <button type="button" aria-current={nav.tab === 'home' ? 'page' : undefined} onClick={() => nav.setTab('home')}>
              Cook
            </button>
            <button type="button" aria-current={nav.tab === 'add' ? 'page' : undefined} onClick={() => nav.setTab('add')}>
              Add
            </button>
            <button type="button" aria-current={nav.tab === 'dishes' ? 'page' : undefined} onClick={() => nav.setTab('dishes')}>
              Dishes
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

/**
 * Screens fire writes as `void repo.x()`; a failed save would otherwise vanish into the
 * console. Catch it here and show a strip, so a tap that did nothing says why.
 */
function useFaultStrip(): { message: string | null; dismiss: () => void } {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | null = null;
    const onReject = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      setMessage(msg);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), 8000);
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      window.removeEventListener('unhandledrejection', onReject);
      if (timer) window.clearTimeout(timer);
    };
  }, []);
  return { message, dismiss: () => setMessage(null) };
}

function screenKey(s: { name: string; id?: number }): string {
  return s.id !== undefined ? `${s.name}:${s.id}` : s.name;
}

function mealWord(): string {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
}
