import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** `undefined` while the stored session is being read; `null` when signed out. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    // INITIAL_SESSION fires first. Never await other supabase calls inside this callback.
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export const MIN_PASSWORD = 8;

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Email confirmation is off for this project, so a sign-up returns a live session. */
export async function signUp(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  if (!data.session) throw new Error('Account created, but email confirmation is switched on for this project — check your mail, then sign in.');
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
