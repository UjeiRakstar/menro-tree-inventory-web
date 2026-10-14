import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';

/**
 * Who is signed in, and who they are.
 *
 * The session says an account exists; the profile says whose it is — which
 * office, which LGU, whether PGENRO has locked it. The website needs both
 * before it can decide what to show, so both load here, once, and every page
 * reads them from the same place.
 *
 *   session  undefined while checking, null when signed out
 *   profile  undefined while loading, null when the account has none
 *   lgu      the LGU row for an LGU admin, null for PGENRO
 */
const AuthContext = createContext(null);

/** PostgREST answers maybeSingle() with an object, or an array in the test mock. */
const firstRow = (data) => (Array.isArray(data) ? data[0] ?? null : data ?? null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  const [lgu, setLgu] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data?.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null));
    return () => data?.subscription?.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  // Which load is current, so a slow answer for the last user cannot land
  // after the next one has signed in.
  const latestLoad = useRef(0);

  const loadProfile = useCallback(async () => {
    const load = ++latestLoad.current;
    if (!userId) {
      setProfile(null);
      setLgu(null);
      return;
    }

    // Every column, not a named list: until supabase/accounts.sql has run,
    // `status` and `lgu_psgc` do not exist, and naming them would fail the
    // read and lock the one person who can run it out of the dashboard.
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (load !== latestLoad.current) return;
    const row = error ? null : firstRow(data);

    let lguRow = null;
    if (row?.lgu_psgc) {
      const { data: lguData } = await supabase
        .from('lgus')
        .select('psgc, name, label, is_city, short_code')
        .eq('psgc', row.lgu_psgc)
        .maybeSingle();
      if (load !== latestLoad.current) return;
      lguRow = firstRow(lguData);
    }

    setLgu(lguRow);
    setProfile(row);
  }, [userId]);

  // On the USER, not the session object. Supabase hands over a fresh session
  // every hour when it refreshes the token, and reloading on that would blank
  // the page to a spinner once an hour for nothing.
  const sessionKnown = session !== undefined;
  useEffect(() => {
    if (!sessionKnown) return;
    setProfile(undefined);
    loadProfile();
  }, [sessionKnown, loadProfile]);

  const value = useMemo(
    () => ({
      session,
      profile,
      lgu,
      loading: session === undefined || (Boolean(session) && profile === undefined),
      refreshProfile: loadProfile,
    }),
    [session, profile, lgu, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}