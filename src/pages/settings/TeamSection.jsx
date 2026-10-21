import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import Section from './Section.jsx';

const when = (value) =>
  value
    ? new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never';

const statusOf = (row) =>
  row.status === 'locked' ? 'Locked' : row.status === 'archived' ? 'Archived' : row.is_approved === false ? 'Waiting for approval' : 'Active';

/**
 * Who is on the field team, and when each last signed in. Adding, approving,
 * locking and removing officers stays on the Field officers page.
 */
/** lgu: the LGU the super admin is working in, to list its officers only. */
export default function TeamSection({ pgenro, lgu = null }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [people, seen] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'field_officer'),
        supabase.rpc('team_last_sign_in'),
      ]);
      if (cancelled) return;
      const lastSeen = new Map((Array.isArray(seen.data) ? seen.data : []).map((row) => [row.id, row.last_sign_in_at]));
      setRows(
        (Array.isArray(people.data) ? people.data : [])
          .filter((row) => !lgu || Number(row.lgu_psgc) === lgu.psgc || row.municipality === lgu.name)
          .map((row) => ({ ...row, lastSignIn: lastSeen.get(row.id) ?? null }))
          .sort((a, b) => String(a.full_name ?? a.email).localeCompare(String(b.full_name ?? b.email)))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [lgu]);

  return (
    <Section title="Field team" description={pgenro ? 'Every LGU’s field officers' : 'The field officers of this LGU'}>
      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading the team…
        </p>
      ) : (
        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">No field officers yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2">Name</th>
                    <th scope="col" className="px-3 py-2">Email</th>
                    <th scope="col" className="px-3 py-2">Status</th>
                    <th scope="col" className="px-3 py-2">Last signed in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row" className="px-3 py-2 font-semibold text-slate-800">{row.full_name || '—'}</th>
                      <td className="px-3 py-2 text-slate-600">{row.email}</td>
                      <td className="px-3 py-2 text-slate-600">{statusOf(row)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{when(row.lastSignIn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link to="/arborists" className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-800 hover:underline">
            <Users size={15} aria-hidden="true" /> Add, approve, lock or remove officers on the Field officers page
          </Link>
        </div>
      )}
    </Section>
  );
}
