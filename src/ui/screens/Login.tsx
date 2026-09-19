import { useState } from 'react';
import { MIN_PASSWORD, signIn, signUp } from '../../auth/session';
import { Kicker } from '../components/bits';

type Mode = 'signin' | 'signup';

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = email.trim().includes('@') && password.length >= MIN_PASSWORD;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(email, password);
      else await signUp(email, password);
      // onAuthStateChange in App switches the screen.
    } catch (e) {
      setError(friendly(e, mode));
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <div className="phone">
        <div className="screen">
          <div className="screen-inner" style={{ paddingTop: 40 }}>
            <Kicker>Akku</Kicker>
            <div className="dsh" style={{ fontSize: 34, lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 10 }}>
              {mode === 'signin' ? 'Your dishes, wherever you are.' : 'Start your repertoire.'}
            </div>
            <p className="mut" style={{ fontSize: 13, marginBottom: 28 }}>
              {mode === 'signin'
                ? 'Sign in and the same dishes, notes and history show up on this phone, the laptop, anywhere.'
                : `One account, one password (${MIN_PASSWORD}+ characters). Nothing to confirm by email.`}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                style={{ marginBottom: 10 }}
              />
              <input
                className="input"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ marginBottom: 12 }}
              />
              <button type="submit" className="btn btn-primary btn-block" disabled={busy || !ready} style={{ marginTop: 0 }}>
                {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <div style={{ marginTop: 16, fontSize: 12.5 }}>
              {mode === 'signin' ? (
                <span className="mut">
                  First time here?{' '}
                  <button type="button" className="link" style={{ fontSize: 'inherit' }} onClick={() => switchMode('signup')}>
                    Create an account
                  </button>
                </span>
              ) : (
                <span className="mut">
                  Already have one?{' '}
                  <button type="button" className="link" style={{ fontSize: 'inherit' }} onClick={() => switchMode('signin')}>
                    Sign in
                  </button>
                </span>
              )}
            </div>

            {error && (
              <div className="warn" style={{ fontSize: 13, marginTop: 16 }}>
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }
}

function friendly(e: unknown, mode: Mode): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(msg)) return mode === 'signin' ? 'Email or password did not match. First time? Create an account below.' : msg;
  if (/already registered/i.test(msg)) return 'That email already has an account — sign in instead.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts for now — wait a minute and try again.';
  if (/password/i.test(msg) && /weak|short|least/i.test(msg)) return `Use at least ${MIN_PASSWORD} characters.`;
  return msg;
}
