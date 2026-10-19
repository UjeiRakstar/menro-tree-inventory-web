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
 *   resident a resident who signed in with Google (supabase/community.sql),
 *            null for everyone else; such an account has no profile
 */
const AuthContext = createContext(null);

/** PostgREST answers maybeSingle() with an object, or an array in the test mock. */
const firstRow = (data) => (Array.isArray(data) ? data[0] ?? null : data ?? null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  const [lgu, setLgu] = useState(null);
  const [resident, setResident] = useState(null);

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
      setResident(null);
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
        // Every column, for the same reason as the profile: the hall pin's
        // columns arrive with municipal_halls.sql, and naming them before then
        // would fail the whole read.
        .select('*')
        .eq('psgc', row.lgu_psgc)
        .maybeSingle();
      if (load !== latestLoad.current) return;
      lguRow = firstRow(lguData);
    }

    // No profile: perhaps a resident. Until community.sql has run the table
    // is not there, and the account is simply one with no profile.
    let residentRow = null;
    if (!row) {
      const { data: residentData, error: residentError } = await supabase
        .from('residents')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (load !== latestLoad.current) return;
      residentRow = residentError ? null : firstRow(residentData);
    }

    setLgu(lguRow);
    setResident(residentRow);
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
      resident,
      loading: session === undefined || (Boolean(session) && profile === undefined),
      refreshProfile: loadProfile,
    }),
    [session, profile, lgu, resident, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The same, or null outside an AuthProvider — for a page that also renders on
 * its own (in a test) and only narrows what it shows when it knows the account.
 */
export function useAuthIfAny() {
  return useContext(AuthContext);
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}