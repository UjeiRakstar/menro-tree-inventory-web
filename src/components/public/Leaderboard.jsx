import { useEffect, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
import { loadLeaderboard } from '../../lib/community.js';

const MEDALS = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-800', 'bg-orange-300 text-orange-950'];

/**
 * The residents who have tagged the most trees that a field officer then
 * verified. Names or nicknames only, as community.sql hands them over.
 *
 *   compact  the phone mockup's screen on About Us: small type, the top five
 *   limit    how many to ask for
 *   lgu      one city or municipality's PSGC code, or null for all Laguna
 */
export default function Leaderboard({ compact = false, limit = compact ? 5 : 10, lgu = null }) {
  const [state, setState] = useState({ loading: true, rows: [], ready: true, error: null });

  useEffect(() => {
    let cancelled = false;
    loadLeaderboard(limit, lgu).then((result) => {
      if (!cancelled) setState({ loading: false, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [limit, lgu]);

  const text = compact ? 'text-[11px]' : 'text-sm';
  let body;
  if (state.loading) {
    body = (
      <p role="status" className={`flex items-center gap-2 ${text} text-slate-500`}>
        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading the leaderboard…
      </p>
    );
  } else if (!state.ready) {
    body = <p className={`${text} text-slate-500`}>The leaderboard opens soon.</p>;
  } else if (state.error) {
    body = <p role="alert" className={`${text} text-red-700`}>The leaderboard could not be loaded.</p>;
  } else if (state.rows.length === 0) {
    body = <p className={`${text} text-slate-500`}>No one is on it yet. Tag a tree and be the first.</p>;
  } else {
    body = (
      <ol className="space-y-1.5" aria-label="Leaderboard">
        {state.rows.map((row) => (
          <li key={row.rank}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${row.is_me ? 'bg-green-100 ring-1 ring-green-300' : 'bg-white ring-1 ring-slate-100'}`}>
            <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${MEDALS[row.rank - 1] ?? 'bg-green-50 text-green-800'}`}>
              {row.rank}
            </span>
            <span className={`min-w-0 flex-1 truncate font-semibold text-slate-800 ${text}`}>
              {row.display_name}{row.is_me && <span className="font-normal text-green-700"> (you)</span>}
            </span>
            <span className={`text-right ${text} text-slate-600`}>
              <span className="font-bold text-green-800">{row.verified}</span> verified
              {!compact && <span className="text-slate-400"> · {row.submitted} sent</span>}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className={compact ? 'flex h-full flex-col bg-gradient-to-b from-green-50 to-white px-3 pb-3 pt-10' : ''}>
      <h3 className={`mb-2 flex items-center gap-1.5 font-bold text-green-900 ${compact ? 'text-sm' : 'text-lg'}`}>
        <Trophy size={compact ? 15 : 18} className="text-amber-500" aria-hidden="true" /> Top tree taggers
      </h3>
      {compact && <p className="mb-2 text-[10px] leading-snug text-slate-500">Trees tagged by residents and verified in the field.</p>}
      {body}
    </div>
  );
}
