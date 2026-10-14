import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, roleOf } from '../lib/roles.js';
import { TreeMap } from './public/PublicMap.jsx';

/**
 * The map, for the LGU offices and PGENRO.
 *
 * The public map, with an office's tools on it — see TreeMap. It replaces the
 * old Command Center, whose Dispatch, Re-assign, Permit and centre buttons and
 * whose pin colours it keeps, and whose Biodiversity / Action toggle it drops.
 *
 * An LGU account sees its own LGU and nothing else; PGENRO sees the province.
 * The centre button flies to the LGU's hall, which its own office pins.
 */
export default function MenroMap() {
  const { profile, lgu, refreshProfile } = useAuth();
  const isLguAdmin = roleOf(profile) === ROLES.LGU_ADMIN;
  const fence = isLguAdmin ? lgu?.name ?? null : null;

  const hall =
    lgu?.hall_lat != null && lgu?.hall_lng != null ? [Number(lgu.hall_lat), Number(lgu.hall_lng)] : null;

  async function pinHall([lat, lng]) {
    const { error } = await supabase.rpc('set_lgu_hall', { p_lat: lat, p_lng: lng });
    if (error) {
      // The function arrives with municipal_halls.sql; before then, say so by
      // name rather than passing on PostgREST's "could not find the function".
      const missing = /could not find the function|does not exist/i.test(error.message ?? '');
      return {
        error: missing
          ? { message: 'Pinning needs supabase/municipal_halls.sql, which has not been run yet.' }
          : error,
      };
    }
    await refreshProfile();
    return {};
  }

  return (
    <>
      <h1 className="sr-only">Map</h1>
      <TreeMap
        mode="admin"
        fence={fence}
        hall={hall}
        canPinHall={isLguAdmin && Boolean(lgu)}
        onPinHall={pinHall}
      />
    </>
  );
}
