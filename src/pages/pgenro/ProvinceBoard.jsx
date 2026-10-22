import { Suspense, lazy } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAttention } from '../../hooks/useAttention.js';

const PermitsLog = lazy(() => import('../PermitsLog.jsx'));
const ManageArborists = lazy(() => import('../ManageArborists.jsx'));
const Accounts = lazy(() => import('./Accounts.jsx'));
const ClimatePlans = lazy(() => import('./ClimatePlans.jsx'));

/**
 * PGENRO's Action Board (22 October): the office work, in one place — every
 * LGU's permit logs, the field officers, the accounts, and the climate plans
 * the LGUs file. They were in the seal's menu; the planting site requests
 * moved to Trees. Each tab is in the address (?tab=…), so a link, the inbox,
 * or the old pages' addresses open the right one.
 *
 * A "!" on a tab is something waiting for PGENRO there: a field officer to
 * approve, a plan to check.
 */
export const BOARD_TABS = Object.freeze([
  { id: 'permits', label: 'Permit logs' },
  { id: 'officers', label: 'Field officers' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'climate-plans', label: 'Climate plans' },
]);

function Waiting({ label }) {
  return (
    <span
      title={label}
      aria-label={label}
      className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
    >
      !
    </span>
  );
}

export default function ProvinceBoard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get('tab');
  const attention = useAttention({ withHazards: false, withPlans: true });

  // The planting site requests are on Trees now.
  if (asked === 'requests') return <Navigate to="/inventory?tab=requests" replace />;
  const tab = BOARD_TABS.some((t) => t.id === asked) ? asked : 'permits';

  const waiting = {
    officers:
      attention.approvals > 0 &&
      `${attention.approvals} field ${attention.approvals === 1 ? 'officer is' : 'officers are'} waiting for approval`,
    'climate-plans':
      attention.plans > 0 && `${attention.plans} climate ${attention.plans === 1 ? 'plan is' : 'plans are'} waiting to be checked`,
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Action Board</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every city and municipality’s permit logs, the field officers, the accounts, and the climate plans the LGUs file.
        </p>
      </div>

      <div role="tablist" aria-label="Action Board views" className="flex flex-wrap gap-2 border-b border-slate-200">
        {BOARD_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setSearchParams({ tab: id }, { replace: true })}
            className={`inline-flex items-center border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {waiting[id] && <Waiting label={waiting[id]} />}
          </button>
        ))}
      </div>

      <Suspense
        fallback={
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin text-green-700" aria-hidden="true" /> Loading…
          </p>
        }
      >
        <div role="tabpanel" aria-label={BOARD_TABS.find((t) => t.id === tab).label}>
          {tab === 'permits' && <PermitsLog embedded />}
          {tab === 'officers' && <ManageArborists />}
          {tab === 'accounts' && <Accounts />}
          {tab === 'climate-plans' && <ClimatePlans />}
        </div>
      </Suspense>
    </section>
  );
}
