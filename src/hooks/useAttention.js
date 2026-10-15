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
 *   proposals  changes PGENRO proposed to this office's map areas, waiting
 *              for its decision — only when `withProposals`, which is an
 *              LGU office: PGENRO's own proposals are not its to decide.
 *              `firstProposalArea` is the oldest one's area, to open.
 *
 * An LGU account counts its own LGU only: the database already narrows the
 * field officers it can see, and the hazards are narrowed here. Counted again
 * on every page change, so a dispatch or an approval clears its badge by the
 * time the next page opens.
 */
export function useAttention({ lguPsgc = null, withProposals = false } = {}) {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({ actions: 0, approvals: 0, proposals: 0, firstProposalArea: null });
  // Bumped when a proposal is made or decided, so the "!" changes live
  // (supabase/live_updates.sql) rather than on the next page.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!withProposals) return undefined;
    const channel = supabase
      .channel('attention-proposals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_area_proposals' }, () =>
        setTick((n) => n + 1)
      )
      .subscribe();
    return () => supabase.removeChannel?.(channel);
  }, [withProposals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [trees, pending, proposals] = await Promise.all([
        supabase.from('trees').select('*'),
        supabase
          .from('profiles')
          .select('id')
          .eq('is_approved', false)
          .is('rejected_at', null),
        // The database shows an office only its own LGU's (map_areas.sql).
        withProposals
          ? supabase
              .from('map_area_proposals')
              .select('id, area_id, proposed_at')
              .eq('status', 'pending')
              .order('proposed_at', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;

      const rows = Array.isArray(trees.data) ? trees.data : [];
      const open = !proposals.error && Array.isArray(proposals.data) ? proposals.data : [];
      const mine = lguPsgc ? rows.filter((tree) => lguOfTree(tree) === Number(lguPsgc)) : rows;
      setCounts({
        actions: trees.error ? 0 : needingAction(mine),
        approvals: pending.error || !Array.isArray(pending.data) ? 0 : pending.data.length,
        proposals: open.length,
        firstProposalArea: open[0]?.area_id ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, lguPsgc, withProposals, tick]);

  return counts;
}
