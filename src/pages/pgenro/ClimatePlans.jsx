import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, FileText, Leaf, Loader2, Undo2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import { forgetVerifiedPlans, lccapMissing, planKindLabel } from '../../lib/lccap.js';

const LABEL = new Map(MUNICIPALITY_LIST.map((lgu) => [lgu.psgc, lgu.label]));
const FILTERS = [
  ['pending', 'Waiting'],
  ['verified', 'Verified'],
  ['returned', 'Returned'],
  ['all', 'All'],
];
const when = (value) => (value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

/**
 * PGENRO's CCAMD checks each LGU's climate plan (supabase/lccap.sql): the
 * plan and the CCC's Certificate of Receipt open from here; Verify gives the
 * LGU its badges, Return sends it back with a note. Either way the LGU's
 * office is told in its Inbox. The waiting ones first.
 */
export default function ClimatePlans() {
  const [plans, setPlans] = useState(null);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [returning, setReturning] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('lccap_submissions').select('*').order('submitted_at', { ascending: false });
      if (cancelled) return;
      setMissing(Boolean(error) && lccapMissing(error));
      setPlans(Array.isArray(data) ? data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => (plans ?? []).filter((p) => filter === 'all' || p.status === filter), [plans, filter]);
  const count = (status) => (plans ?? []).filter((p) => p.status === status).length;

  async function review(plan, verified) {
    setProblem('');
    setBusy(plan.id);
    const { error } = await supabase.rpc('review_lccap', { p_id: plan.id, p_verified: verified, p_note: verified ? null : note });
    setBusy('');
    if (error) {
      setProblem(error.message);
      return;
    }
    forgetVerifiedPlans();
    setPlans((current) =>
      current.map((p) => (p.id === plan.id ? { ...p, status: verified ? 'verified' : 'returned', review_note: verified ? null : note.trim(), reviewed_at: new Date().toISOString() } : p))
    );
    setReturning(null);
    setNote('');
  }

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Leaf size={24} className="text-green-700" aria-hidden="true" /> Climate plans
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Each LGU&apos;s LCCAP or eLCCAP, filed for checking. Verified, the LGU shows &ldquo;LCCAP on file&rdquo; while the plan&apos;s
          years run, and &ldquo;Submitted to the CCC&rdquo; when its Certificate of Receipt is attached.
        </p>
      </div>

      {missing && (
        <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          This page needs supabase/lccap.sql, which has not been run yet.
        </p>
      )}
      {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}

      <div role="tablist" aria-label="Which plans" className="flex flex-wrap gap-2">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${filter === id ? 'bg-green-700 text-white ring-green-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>
            {label}
            {id !== 'all' && plans && <span className="ml-1.5 opacity-80">{count(id)}</span>}
          </button>
        ))}
      </div>

      {plans === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">Nothing here.</p>
      ) : (
        <ul className="space-y-3" aria-label="Plans">
          {shown.map((plan) => {
            const lgu = LABEL.get(Number(plan.lgu_psgc)) ?? String(plan.lgu_psgc);
            return (
              <li key={plan.id} aria-label={`${lgu} ${planKindLabel(plan.plan_kind)}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{lgu}</p>
                    <p className="text-sm text-slate-600">
                      {planKindLabel(plan.plan_kind)} {plan.term_start}–{plan.term_end} · filed {when(plan.submitted_at)}
                      {plan.reviewed_at && ` · ${plan.status === 'verified' ? 'verified' : 'returned'} ${when(plan.reviewed_at)}`}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-3 text-sm">
                      <a href={plan.plan_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-green-800 underline">
                        <FileText size={14} aria-hidden="true" /> Open the plan
                      </a>
                      {plan.receipt_url ? (
                        <a href={plan.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-green-800 underline">
                          <FileText size={14} aria-hidden="true" /> Open the CCC Certificate of Receipt
                        </a>
                      ) : (
                        <span className="text-slate-500">No CCC Certificate of Receipt</span>
                      )}
                    </p>
                    {plan.review_note && <p className="mt-2 text-xs text-slate-600">Returned: {plan.review_note}</p>}
                  </div>
                  {plan.status === 'pending' && returning !== plan.id && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => review(plan, true)} disabled={Boolean(busy)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">
                        {busy === plan.id ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <BadgeCheck size={15} aria-hidden="true" />}
                        Verify
                      </button>
                      <button type="button" onClick={() => { setReturning(plan.id); setNote(''); }} disabled={Boolean(busy)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">
                        <Undo2 size={15} aria-hidden="true" /> Return
                      </button>
                    </div>
                  )}
                </div>
                {returning === plan.id && (
                  <div className="mt-3 space-y-2 rounded-xl bg-red-50/60 p-3 ring-1 ring-red-100">
                    <label className="block text-sm font-semibold text-slate-700">
                      Why it is returned
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                        placeholder="e.g. The plan's annexes are missing; the term is not the one in the plan."
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => review(plan, false)} disabled={!note.trim() || Boolean(busy)}
                        className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                        Return it to {lgu}
                      </button>
                      <button type="button" onClick={() => setReturning(null)} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
