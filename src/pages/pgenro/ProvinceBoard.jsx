import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Loader2 } from 'lucide-react';
import { useBoardData } from '../../components/board/ActionSummary.jsx';
import ProvincePermits from './ProvincePermits.jsx';
import PlantingRequests from '../../components/PlantingRequests.jsx';

/**
 * The Action Board, for PGENRO: every LGU's permit logs, and the planting
 * site requests to decide. Read-only otherwise — the work stays with each
 * MENRO/CENRO. The province at a glance moved to the BioDashboard
 * (17 October), with the figures it belongs beside.
 */
export default function ProvinceBoard() {
  // ?tab=requests opens the planting site requests (the header's menu links there).
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => (searchParams.get('tab') === 'requests' ? 'requests' : 'permits'));
  useEffect(() => {
    if (searchParams.get('tab') === 'requests') setTab('requests');
  }, [searchParams]);
  const { data, loading, loadError, labelOf } = useBoardData();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Action Board</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
          <Eye size={14} aria-hidden="true" />
          Read-only: dispatching, re-assigning and permits stay with each MENRO/CENRO. What needs action across Laguna is
          on the{' '}
          <Link to="/biodiversity-dashboard" className="font-semibold text-green-800 hover:underline">
            BioDashboard
          </Link>
          .
        </p>
      </div>

      <div role="tablist" aria-label="Action Board views" className="flex gap-2 border-b border-slate-200">
        {[
          ['permits', 'Permit logs'],
          ['requests', 'Planting site requests'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'requests' ? (
        <PlantingRequests decides />
      ) : loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin text-green-700" aria-hidden="true" /> Loading the province…
        </p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-red-700">{loadError}</p>
      ) : (
        <ProvincePermits permits={data.permits} trees={data.trees} lgus={data.lgus} labelOf={labelOf} />
      )}
    </section>
  );
}
