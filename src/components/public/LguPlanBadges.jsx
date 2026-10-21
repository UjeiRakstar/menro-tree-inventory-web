import { useEffect, useState } from 'react';
import { BadgeCheck, FileCheck2 } from 'lucide-react';
import { loadVerifiedPlans, planBadges, planKindLabel } from '../../lib/lccap.js';

/**
 * The badges a city or municipality shows for its climate plan, once PGENRO
 * has verified it (supabase/lccap.sql): "LCCAP on file" while the plan's
 * years run, and "Submitted to the CCC" with its Certificate of Receipt.
 * Each opens its document. Nothing at all for an LGU without one.
 *
 *   lguPsgc   the LGU's PSGC code
 *   tone      'light' on white, 'dark' on green
 */
export default function LguPlanBadges({ lguPsgc, tone = 'light' }) {
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    let cancelled = false;
    loadVerifiedPlans().then((rows) => !cancelled && setPlans(rows));
    return () => {
      cancelled = true;
    };
  }, []);

  const badges = lguPsgc ? planBadges(plans, lguPsgc) : null;
  if (!badges) return null;
  const { plan } = badges;
  const kind = planKindLabel(plan.plan_kind);
  const chip =
    tone === 'dark'
      ? 'bg-white/15 text-white ring-white/40 hover:bg-white/25'
      : 'bg-green-50 text-green-900 ring-green-300 hover:bg-green-100';

  return (
    <span className="inline-flex flex-wrap items-center gap-2" aria-label="Climate plan badges">
      <a href={plan.plan_url} target="_blank" rel="noreferrer"
        title={`${kind} ${plan.term_start}–${plan.term_end}, verified by PGENRO. Opens the plan.`}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${chip}`}>
        <BadgeCheck size={14} aria-hidden="true" /> {kind} on file · {plan.term_start}–{plan.term_end}
      </a>
      {badges.toCcc && (
        <a href={plan.receipt_url} target="_blank" rel="noreferrer"
          title="The Climate Change Commission's Certificate of Receipt: the plan was submitted to the Commission. Opens the certificate."
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${chip}`}>
          <FileCheck2 size={14} aria-hidden="true" /> Submitted to the CCC
        </a>
      )}
    </span>
  );
}
