import { useEffect, useState } from 'react';
import { BadgeCheck, Clock, FileText, Loader2, Undo2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { PLAN_KINDS, RECEIPT_TYPES, lccapMissing, lccapProblems, planKindLabel, uploadLccapFile } from '../../lib/lccap.js';
import Section, { Outcome, buttonClass, inputClass } from './Section.jsx';

const STATUS = {
  pending: { label: 'Waiting for PGENRO', icon: Clock, tone: 'bg-amber-50 text-amber-900 ring-amber-200' },
  verified: { label: 'Verified', icon: BadgeCheck, tone: 'bg-green-50 text-green-900 ring-green-200' },
  returned: { label: 'Returned', icon: Undo2, tone: 'bg-red-50 text-red-800 ring-red-200' },
};

/**
 * The LGU's Local Climate Change Action Plan (supabase/lccap.sql): filed here
 * or at the office's first sign-in, checked by PGENRO's CCAMD. Verified, it
 * shows two badges where the city or municipality is chosen, and counts in
 * the City Biodiversity Index among the LGU's plans.
 *
 *   lgu    the LGU ({ psgc, name, label })
 *   bare   without the Section around it, for the first sign-in
 */
export default function ClimatePlanSection({ lgu, bare = false }) {
  const thisYear = new Date().getFullYear();
  const [filed, setFiled] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ planKind: 'elccap', termStart: '', termEnd: '', plan: null, receipt: null });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('lccap_submissions')
        .select('*')
        .eq('lgu_psgc', lgu.psgc)
        .order('submitted_at', { ascending: false });
      if (cancelled) return;
      setMissing(Boolean(error) && lccapMissing(error));
      setFiled(Array.isArray(data) ? data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [lgu.psgc]);

  const problems = lccapProblems(form);
  const shown = tried ? problems : {};
  const pickFile = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.files?.[0] ?? null }));

  async function submit(event) {
    event.preventDefault();
    setTried(true);
    setOutcome(null);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const planUrl = await uploadLccapFile(lgu.psgc, form.plan, 'plan');
      const receiptUrl = form.receipt ? await uploadLccapFile(lgu.psgc, form.receipt, 'ccc-receipt') : null;
      const { data, error } = await supabase
        .from('lccap_submissions')
        .insert({
          lgu_psgc: lgu.psgc,
          plan_kind: form.planKind,
          term_start: Number(form.termStart),
          term_end: Number(form.termEnd),
          plan_url: planUrl,
          receipt_url: receiptUrl,
        })
        .select()
        .single();
      if (error) throw new Error(lccapMissing(error) ? 'Filing a climate plan needs supabase/lccap.sql, which has not been run yet.' : error.message);
      setFiled((current) => [data, ...(current ?? [])]);
      setForm({ planKind: form.planKind, termStart: '', termEnd: '', plan: null, receipt: null });
      setTried(false);
      setOutcome({ ok: true, text: 'Filed. PGENRO’s CCAMD has it in its Inbox, and you will be told here and in your Inbox once it is checked.' });
    } catch (failure) {
      setOutcome({ ok: false, text: failure.message });
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="space-y-5">
      {missing && (
        <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Filing a climate plan needs supabase/lccap.sql, which has not been run yet.
        </p>
      )}

      {filed?.length > 0 && (
        <ul className="space-y-2" aria-label="Plans filed">
          {filed.map((plan) => {
            const status = STATUS[plan.status] ?? STATUS.pending;
            const Icon = status.icon;
            const lapsed = plan.status === 'verified' && plan.term_end < thisYear;
            return (
              <li key={plan.id} className={`rounded-xl px-4 py-3 text-sm ring-1 ${status.tone}`}>
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <Icon size={16} aria-hidden="true" />
                  {planKindLabel(plan.plan_kind)} {plan.term_start}–{plan.term_end}
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs">{lapsed ? 'Verified, its years are over' : status.label}</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-3 text-xs">
                  <a href={plan.plan_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                    <FileText size={13} aria-hidden="true" /> The plan
                  </a>
                  {plan.receipt_url ? (
                    <a href={plan.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                      <FileText size={13} aria-hidden="true" /> CCC Certificate of Receipt
                    </a>
                  ) : (
                    <span>No CCC Certificate of Receipt</span>
                  )}
                </p>
                {plan.review_note && <p className="mt-1 text-xs">PGENRO: {plan.review_note}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={submit} aria-label="File a climate plan" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-semibold text-slate-700">
            Plan
            <select value={form.planKind} onChange={(e) => setForm((c) => ({ ...c, planKind: e.target.value }))} className={inputClass}>
              {PLAN_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            From (year)
            <input type="number" inputMode="numeric" min={2000} max={2100} placeholder={String(thisYear)}
              value={form.termStart} onChange={(e) => setForm((c) => ({ ...c, termStart: e.target.value }))} className={inputClass} />
            {shown.termStart && <span className="mt-1 block text-xs font-normal text-red-700">{shown.termStart}</span>}
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            To (year)
            <input type="number" inputMode="numeric" min={2000} max={2100} placeholder={String(thisYear + 8)}
              value={form.termEnd} onChange={(e) => setForm((c) => ({ ...c, termEnd: e.target.value }))} className={inputClass} />
            {shown.termEnd && <span className="mt-1 block text-xs font-normal text-red-700">{shown.termEnd}</span>}
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            The plan (PDF)
            <input type="file" accept="application/pdf" onChange={pickFile('plan')} className="mt-1 block w-full text-sm" />
            {shown.plan && <span className="mt-1 block text-xs font-normal text-red-700">{shown.plan}</span>}
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            CCC Certificate of Receipt <span className="font-normal text-slate-500">(if you have it)</span>
            <input type="file" accept={RECEIPT_TYPES.join(',')} onChange={pickFile('receipt')} className="mt-1 block w-full text-sm" />
            {shown.receipt && <span className="mt-1 block text-xs font-normal text-red-700">{shown.receipt}</span>}
          </label>
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
          PGENRO&apos;s Climate Change Adaptation and Mitigation Division checks what you file. Once it is verified,{' '}
          {lgu.label} shows a badge that its plan is on file, and another that it was submitted to the Climate Change
          Commission if the Certificate of Receipt is attached; the plan counts in the City Biodiversity Index among its
          plans and policies. Verified plans and their certificates can be opened by anyone who sees the badges.
        </p>
        <button type="submit" disabled={busy} className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
          {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          File the plan with PGENRO
        </button>
        <Outcome outcome={outcome} />
      </form>
    </div>
  );

  if (bare) return body;
  return (
    <Section title="Climate change action plan" description="The LGU's LCCAP or eLCCAP, filed with PGENRO for checking">
      {body}
    </Section>
  );
}
