import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { isPgenro } from '../lib/roles.js';
import { MUNICIPALITY_LIST } from '../lib/lagunaBoundaries.js';
import ActionSummary, { useBoardData } from '../components/board/ActionSummary.jsx';
import { BioDashboardView } from './public/PublicDashboard.jsx';
import PendingTreesTable from '../components/admin/PendingTreesTable.jsx';

/**
 * The BioDashboard for the offices (decided 17 October): the public
 * BioDashboard's figures, with what needs action put first.
 *
 *   MENRO / CENRO  its own LGU — the summary of its hazards, tags, watch list
 *                  and progress, by barangay; the figures, narrowed to a
 *                  barangay from a list or the map
 *   PGENRO         the province — the summary that was its Action Board's
 *                  overview, with the seals to narrow both to one LGU
 *
 * Community tags waiting for a field check are a tab of their own: the
 * office verifies them there; PGENRO reads them.
 */
export default function OfficeBioDashboard() {
  const { profile } = useAuth();
  const pgenro = isPgenro(profile);
  const [searchParams] = useSearchParams();
  const board = useBoardData();
  const [tab, setTab] = useState('dashboard');

  const ownLgu = pgenro ? null : MUNICIPALITY_LIST.find((lgu) => lgu.psgc === Number(profile?.lgu_psgc)) ?? null;
  // PGENRO's seals narrow the summary too: one LGU chosen, its numbers.
  const chosen = pgenro ? MUNICIPALITY_LIST.find((lgu) => lgu.name === searchParams.get('lgu')) ?? null : ownLgu;
  const waitingTags = useMemo(
    () => board.data.tags.filter((tag) => !tag.status || tag.status === 'pending').length,
    [board.data.tags]
  );

  const top = (
    <section aria-label="What needs action" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
        {chosen ? `${chosen.label} — what needs action` : 'Laguna — what needs action'}
      </h2>
      <div className="mt-3">
        {board.loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={15} className="animate-spin text-green-700" aria-hidden="true" /> Loading…
          </p>
        ) : board.loadError ? (
          <p role="alert" className="text-sm text-red-700">{board.loadError}</p>
        ) : (
          <ActionSummary data={board.data} labelOf={board.labelOf} lgu={chosen ? chosen.psgc : undefined} />
        )}
      </div>
    </section>
  );

  return (
    // The shell pads its pages; the dashboard brings its own full-width padding.
    <div className="-m-6">
      <div role="tablist" aria-label="BioDashboard views" className="flex gap-2 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
        {[
          ['dashboard', 'BioDashboard'],
          ['tags', `Community tags${waitingTags ? ` (${waitingTags})` : ''}`],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
              tab === id ? 'border-green-700 text-green-800' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'tags' ? (
        <div className="p-6">
          <PendingTreesTable readOnly={pgenro} />
        </div>
      ) : (
        <BioDashboardView audience={pgenro ? 'pgenro' : 'office'} lockedLgu={ownLgu?.name ?? null} top={top} />
      )}
    </div>
  );
}
