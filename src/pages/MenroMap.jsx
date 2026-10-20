import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, roleOf } from '../lib/roles.js';
import { TreeMap } from './public/PublicMap.jsx';

/** PostgREST's "no such function", said as the file that brings it. */
const missingFunction = (error, file) =>
  /could not find the function|does not exist/i.test(error?.message ?? '')
    ? { message: `Pinning needs supabase/${file}, which has not been run yet.` }
    : error;

/**
 * The map, for the LGU offices and PGENRO.
 *
 * The public map, with an office's tools on it — see TreeMap. It replaces the
 * old Command Center, whose Dispatch, Re-assign, Permit and centre buttons and
 * whose pin colours it keeps, and whose Biodiversity / Action toggle it drops.
 *
 * An LGU account sees its own LGU and nothing else; PGENRO sees the province.
 * The centre button flies to the LGU's hall, which its own office pins — but
 * not a training account: the hall is the real one, and the database refuses
 * a trainee's pin (training_sandbox.sql), so the map does not offer it.
 *
 * PGENRO's centre button flies to the Provincial Capitol, which PGENRO pins,
 * and its map shows every hall the LGUs have pinned (decided 18 October).
 * The halls themselves are the LGUs' to pin, not PGENRO's.
 */
export default function MenroMap() {
  const { profile, lgu, refreshProfile } = useAuth();
  const isLguAdmin = roleOf(profile) === ROLES.LGU_ADMIN;
  const pgenro = roleOf(profile) === ROLES.PGENRO;
  const inTraining = Boolean(profile?.is_training);
  const fence = isLguAdmin ? lgu?.name ?? null : null;
  const [capitol, setCapitol] = useState(null);
  const [halls, setHalls] = useState([]);

  const loadProvincePins = useCallback(async () => {
    const [capitolRead, lgusRead] = await Promise.all([
      supabase.from('provincial_capitol').select('lat, lng').maybeSingle(),
      // Every column: the hall columns arrive with municipal_halls.sql.
      supabase.from('lgus').select('*'),
    ]);
    const row = Array.isArray(capitolRead.data) ? capitolRead.data[0] : capitolRead.data;
    setCapitol(!capitolRead.error && row?.lat != null ? [Number(row.lat), Number(row.lng)] : null);
    setHalls(
      (Array.isArray(lgusRead.data) ? lgusRead.data : [])
        .filter((item) => item.hall_lat != null && item.hall_lng != null)
        .map((item) => ({
          psgc: item.psgc,
          name: `${item.label} ${item.is_city ? 'City Hall' : 'Municipal Hall'}`,
          position: [Number(item.hall_lat), Number(item.hall_lng)],
        }))
    );
  }, []);

  useEffect(() => {
    if (pgenro) loadProvincePins();
  }, [pgenro, loadProvincePins]);

  const ownHall =
    lgu?.hall_lat != null && lgu?.hall_lng != null ? [Number(lgu.hall_lat), Number(lgu.hall_lng)] : null;

  async function pinHall([lat, lng]) {
    const { error } = await supabase.rpc('set_lgu_hall', { p_lat: lat, p_lng: lng });
    if (error) return { error: missingFunction(error, 'municipal_halls.sql') };
    await refreshProfile();
    return {};
  }

  async function pinCapitol([lat, lng]) {
    const { error } = await supabase.rpc('set_capitol', { p_lat: lat, p_lng: lng });
    if (error) return { error: missingFunction(error, 'municipal_halls.sql') };
    await loadProvincePins();
    return {};
  }

  return (
    <>
      <h1 className="sr-only">Map</h1>
      <TreeMap
        mode="admin"
        fence={fence}
        hall={pgenro ? capitol : ownHall}
        hallName={pgenro ? 'Provincial Capitol' : null}
        otherHalls={pgenro ? halls : []}
        canPinHall={!inTraining && ((isLguAdmin && Boolean(lgu)) || pgenro)}
        profile={profile}
        onPinHall={pgenro ? pinCapitol : pinHall}
      />
    </>
  );
}
