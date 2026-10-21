import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Loader2, Printer, X } from 'lucide-react';
import { saveAs } from 'file-saver';
import { officeOf } from '../lib/workbookLook.js';
import { treesCovered } from '../lib/permitLogs.js';
import { GROUPINGS, MONTH_NAMES, PERIOD_KINDS, groupLabel, groupPermits, periodOf, permitReportWorkbook, permitsIn } from '../lib/permitReport.js';

/**
 * The permit report (21 October): choose the period — a year, a quarter, a
 * month or dates — and what to sum the permits by, then download it in the
 * standard Excel look or print it. Its template is permitReport.js's.
 *
 *   permits     the permits the page shows
 *   lgu         the office's LGU ({ psgc, name, label, isCity }), or null for the province
 *   lguOf       a permit's LGU label
 *   preparedBy  who is making it
 */
export default function PermitReport({ open, onClose, permits, lgu = null, lguOf = () => null, preparedBy = '' }) {
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const set = new Set([thisYear]);
    for (const p of permits) {
      const year = new Date(p.created_at).getFullYear();
      if (Number.isFinite(year)) set.add(year);
    }
    return [...set].sort((a, b) => b - a);
  }, [permits, thisYear]);
  const groupings = GROUPINGS.filter((g) => !(g.provinceOnly && lgu));

  const [kind, setKind] = useState('year');
  const [year, setYear] = useState(thisYear);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [by, setBy] = useState(groupings[0].id);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return undefined;
    // Drawn first, then printed, then put away — as the certificate is.
    const timer = setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [printing]);

  const period = periodOf({ kind, year, quarter, month, from, to });
  const chosen = permitsIn(permits, period);
  const groups = groupPermits(chosen, by, { lguOf });
  const grouping = GROUPINGS.find((g) => g.id === by)?.label ?? 'Group';

  if (!open) return null;

  async function downloadExcel() {
    setProblem('');
    setBusy(true);
    try {
      const blob = await permitReportWorkbook({ permits, period, by, lgu, lguOf, preparedBy });
      const place = (lgu?.label ?? 'Laguna').replace(/\s+/g, '-');
      saveAs(blob, `Permit-report_${place}_${period.label.replace(/[^A-Za-z0-9]+/g, '-')}.xlsx`);
    } catch (failure) {
      setProblem(`The report could not be made: ${failure.message}`);
    } finally {
      setBusy(false);
    }
  }

  const control = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20';
  const label = 'block text-xs font-semibold uppercase tracking-wide text-slate-600';
  const office = officeOf(lgu);
  const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/40 p-4 print:hidden"
        onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div role="dialog" aria-modal="true" aria-labelledby="permit-report-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id="permit-report-title" className="text-lg font-bold text-slate-900">Permit report</h2>
            <button type="button" onClick={onClose} aria-label="Close the permit report" className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
              <X size={20} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Period
              <select value={kind} onChange={(e) => setKind(e.target.value)} className={control}>
                {PERIOD_KINDS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            {kind !== 'range' && (
              <label className={label}>
                Year
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={control}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            )}
            {kind === 'quarter' && (
              <label className={label}>
                Quarter
                <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className={control}>
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>Q{q} — {MONTH_NAMES[(q - 1) * 3]} to {MONTH_NAMES[(q - 1) * 3 + 2]}</option>
                  ))}
                </select>
              </label>
            )}
            {kind === 'month' && (
              <label className={label}>
                Month
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={control}>
                  {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                </select>
              </label>
            )}
            {kind === 'range' && (
              <>
                <label className={label}>
                  From
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={control} />
                </label>
                <label className={label}>
                  To
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={control} />
                </label>
              </>
            )}
            <label className={`${label} sm:col-span-2`}>
              Sum the permits by
              <select value={by} onChange={(e) => setBy(e.target.value)} className={control}>
                {groupings.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </label>
          </div>

          <div role="status" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
            {period ? (
              <>
                <strong>{chosen.length}</strong> {chosen.length === 1 ? 'permit' : 'permits'} in {period.label}
                {chosen.length > 0 && `, covering ${groups.reduce((sum, g) => sum + g.trees, 0)} trees, in ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}.
              </>
            ) : (
              'Choose the dates, the first on or before the last.'
            )}
          </div>
          {problem && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={downloadExcel} disabled={!period || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={15} aria-hidden="true" />}
              Excel (.xlsx)
            </button>
            <button type="button" onClick={() => setPrinting(true)} disabled={!period}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50 disabled:opacity-50">
              <Printer size={15} aria-hidden="true" /> Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* The printed report: drawn only while printing, the page's only visible part then. */}
      {printing && period && (
        <div data-testid="permit-report-print" className="hidden bg-white p-2 text-[10pt] text-black print:block">
          <header className="text-center">
            <p className="text-[9pt]">Republic of the Philippines</p>
            {office.heading.map((line, i) => (
              <p key={line} className={i === 0 ? 'font-bold' : 'text-[9pt]'}>{line}</p>
            ))}
            <p className="font-bold text-green-800">{office.office}</p>
            <h1 className="mt-3 text-[14pt] font-extrabold">TREE CUTTING PERMIT REPORT</h1>
            <p>{period.label} · by {grouping.toLowerCase()}</p>
            <p className="text-[8pt] italic">Prepared by {preparedBy || 'the office'} · {date}</p>
          </header>

          <h2 className="mt-4 font-bold">Summary</h2>
          <table className="mt-1 w-full border-collapse text-[9pt]">
            <thead>
              <tr className="bg-green-700 text-white">
                <th className="border border-slate-400 px-2 py-1 text-left">{grouping}</th>
                <th className="border border-slate-400 px-2 py-1 text-right">Permits</th>
                <th className="border border-slate-400 px-2 py-1 text-right">Trees covered</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.name}>
                  <td className="border border-slate-300 px-2 py-0.5">{groupLabel(by, g.name)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right">{g.permits.length}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right">{g.trees}</td>
                </tr>
              ))}
              <tr className="bg-green-50 font-bold">
                <td className="border border-slate-400 px-2 py-0.5">All</td>
                <td className="border border-slate-400 px-2 py-0.5 text-right">{chosen.length}</td>
                <td className="border border-slate-400 px-2 py-0.5 text-right">{groups.reduce((sum, g) => sum + g.trees, 0)}</td>
              </tr>
            </tbody>
          </table>

          {groups.map((g) => (
            <section key={g.name} className="mt-4 break-inside-avoid-page">
              <h2 className="font-bold">{groupLabel(by, g.name)} — {g.permits.length} {g.permits.length === 1 ? 'permit' : 'permits'}</h2>
              <table className="mt-1 w-full border-collapse text-[8.5pt]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-1.5 py-0.5 text-left">Issued</th>
                    <th className="border border-slate-300 px-1.5 py-0.5 text-left">Client</th>
                    <th className="border border-slate-300 px-1.5 py-0.5 text-left">Address</th>
                    {!lgu && <th className="border border-slate-300 px-1.5 py-0.5 text-left">City / municipality</th>}
                    <th className="border border-slate-300 px-1.5 py-0.5 text-left">Species</th>
                    <th className="border border-slate-300 px-1.5 py-0.5 text-right">Trees</th>
                    <th className="border border-slate-300 px-1.5 py-0.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g.permits.map((p) => (
                    <tr key={p.id}>
                      <td className="border border-slate-300 px-1.5 py-0.5">{p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : ''}</td>
                      <td className="border border-slate-300 px-1.5 py-0.5">{p.client_name || ''}</td>
                      <td className="border border-slate-300 px-1.5 py-0.5">{p.address || ''}</td>
                      {!lgu && <td className="border border-slate-300 px-1.5 py-0.5">{lguOf(p) ?? 'Not placed'}</td>}
                      <td className="border border-slate-300 px-1.5 py-0.5">{p.species || ''}</td>
                      <td className="border border-slate-300 px-1.5 py-0.5 text-right">{treesCovered(p)}</td>
                      <td className="border border-slate-300 px-1.5 py-0.5">{p.status || 'Pending'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          <p className="mt-4 text-[8pt] italic">Permits counted by the day they were issued. A walk-in permit can cover several trees. Green Tag · {office.place}</p>
        </div>
      )}
    </>
  );
}
