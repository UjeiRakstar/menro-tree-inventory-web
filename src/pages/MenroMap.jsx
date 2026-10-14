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
 */
export default function MenroMap() {
  const { profile, lgu } = useAuth();
  const fence = roleOf(profile) === ROLES.LGU_ADMIN ? lgu?.name ?? null : null;

  return (
    <>
      <h1 className="sr-only">Map</h1>
      <TreeMap mode="admin" fence={fence} />
    </>
  );
}
