import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { needingAction } from '../lib/adminPins.js';
import { everyRow } from '../lib/everyRow.js';

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
 *   requests   planting site requests (planting_requests.sql) — for PGENRO,
 *              those waiting for its decision; for an office, its own that
 *              PGENRO declined, to correct or withdraw. Only when `withRequests`.
 *   inbox      the office's unread messages (inbox.sql). Only when `withInbox`.
 *
 * An LGU account counts its own LGU only: the database already narrows the
 * field officers it can see, and the hazards are narrowed here. Counted again
 * on every page change, so a dispatch or an approval clears its badge by the
 * time the next page opens.
 */
export function useAttention({ lguPsgc = null, withProposals = false, withRequests = null, withInbox = false } = {}) {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({ actions: 0, approvals: 0, proposals: 0, firstProposalArea: null, requests: 0, inbox: 0 });
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
    if (!withRequests) return undefined;
    const channel = supabase
      .channel('attention-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_areas' }, () => setTick((n) => n + 1))
      .subscribe();
    return () => supabase.removeChannel?.(channel);
  }, [withRequests]);

  useEffect(() => {
    if (!withInbox) return undefined;
    const channel = supabase
      .channel('attention-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_messages' }, () => setTick((n) => n + 1))
      .subscribe();
    return () => supabase.removeChannel?.(channel);
  }, [withInbox]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [trees, pending, proposals, requests, inbox] = await Promise.all([
        everyRow(() => supabase.from('trees').select('*')),
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
        // 'waiting': PGENRO's to decide; 'declined': an office's to answer.
        withRequests
          ? supabase
              .from('map_areas')
              .select('id')
              .eq('kind', 'planting-site')
              .eq('approval', withRequests === 'waiting' ? 'requested' : 'declined')
          : Promise.resolve({ data: [], error: null }),
        // The database shows an office its own inbox only (inbox.sql).
        withInbox
          ? supabase.from('inbox_messages').select('id').is('read_at', null).is('archived_at', null)
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
        requests: requests.error || !Array.isArray(requests.data) ? 0 : requests.data.length,
        inbox: inbox.error || !Array.isArray(inbox.data) ? 0 : inbox.data.length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, lguPsgc, withProposals, withRequests, withInbox, tick]);

  return counts;
}
