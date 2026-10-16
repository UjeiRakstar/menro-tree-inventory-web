import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';

// Read once per page: a letterhead does not change while a certificate prints.
const cache = new Map();

/** Forget what was read — after Settings saves a profile. */
export const forgetOfficeProfile = (office) => cache.delete(office);

/**
 * An office's profile (supabase/office_settings.sql) — names, address,
 * contacts, logos — or null when it has none, or before the table exists.
 * `office` is an LGU's PSGC code or 'pgenro'.
 */
export function useOfficeProfile(office) {
  const key = office == null ? null : String(office);
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    if (!key) {
      setProfile(null);
      return undefined;
    }
    let cancelled = false;
    if (!cache.has(key)) {
      cache.set(
        key,
        (async () => {
          const { data, error } = await supabase.from('office_profiles').select('*').eq('office', key).maybeSingle();
          return error ? null : (Array.isArray(data) ? data[0] : data) ?? null;
        })()
      );
    }
    Promise.resolve(cache.get(key)).then((row) => !cancelled && setProfile(row ?? null));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return profile;
}
