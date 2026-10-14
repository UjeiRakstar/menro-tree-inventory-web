import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { needingAction } from '../lib/adminPins.js';

/**
 * The barangay's PSGC code, cut down to its city or municipality's.
 *
 * PSA codes nest: Labuin is 403426001, Santa Cruz is 403426000. That is enough
 * to tell which LGU a tree is in without loading the boundary maps into every
 * page's header.
 */
export const lguOfTree = (tree) => {
  const code = Number(tree?.barangay_psgc);
  return Number.isFinite(code) && code > 0 ? Math.floor(code / 1000) * 1000 : null;
};

/**
 * What needs the signed-in office, for the two badges in the header.
 *
 *   actions  hazards nobody has been sent to yet — the red pins
 *   approvals  field officers who registered in the app and are waiting
 *
 * An LGU account counts its own LGU only: the database already narrows the
 * field officers it can see, and the hazards are narrowed here. Counted again
 * on every page change, so a dispatch or an approval clears its badge by the
 * time the next page opens.
 */
export function useAttention({ lguPsgc = null } = {}) {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({ actions: 0, approvals: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [trees, pending] = await Promise.all([
        supabase.from('trees').select('*'),
        supabase
          .from('profiles')
          .select('id')
          .eq('is_approved', false)
          .is('rejected_at', null),
      ]);
      if (cancelled) return;

      const rows = Array.isArray(trees.data) ? trees.data : [];
      const mine = lguPsgc ? rows.filter((tree) => lguOfTree(tree) === Number(lguPsgc)) : rows;
      setCounts({
        actions: trees.error ? 0 : needingAction(mine),
        approvals: pending.error || !Array.isArray(pending.data) ? 0 : pending.data.length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, lguPsgc]);

  return counts;
}
