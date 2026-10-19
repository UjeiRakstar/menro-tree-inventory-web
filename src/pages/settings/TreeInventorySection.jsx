import { useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { Download, FileUp, Loader2, ShieldCheck, TreePine } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { barangayAt, loadBarangayIndex } from '../../lib/barangayLookup.js';
import { MAX_ROWS, groupProblems, inventoryRow, inventoryTemplate, notYetImported, readInventory, rowsOfFile } from '../../lib/treeInventory.js';
import { barangaysOf } from '../../lib/lguOptions.js';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import { everyRow } from '../../lib/everyRow.js';
import Section, { Outcome, buttonClass } from './Section.jsx';

const BATCH = 200;
const count = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** A column the database does not have yet: community.sql has not run. */
const isMissingColumn = (error) =>
  error?.code === '42703' || error?.code === 'PGRST204' || /column .* does not exist|Could not find the/i.test(error?.message ?? '');

/**
 * The office's existing tree inventory, from the standard spreadsheet
 * (lib/treeInventory.js). Its trees come in as unverified tags, grey on the
 * map until a field officer verifies each one with photos.
 *
 * The same file brought in again adds nothing twice: trees already in are
 * counted and left out.
 *
 *   lgu     the office's LGU ({ name, label, psgc })
 *   pgenro  PGENRO, who brings in an LGU's inventory for it — San Pedro's
 *           before San Pedro has an account — choosing the LGU first
 *   bare    without the Settings section around it — for the first sign-in
 */
export default function TreeInventorySection({ lgu: ownLgu = null, pgenro = false, bare = false }) {
  const input = useRef(null);
  const [busy, setBusy] = useState('');
  const [read, setRead] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [chosen, setChosen] = useState('');
  const lgu = ownLgu ?? MUNICIPALITY_LIST.find((item) => String(item.psgc) === chosen) ?? null;

  function choose(event) {
    setChosen(event.target.value);
    setRead(null);
    setOutcome(null);
  }

  async function downloadTemplate() {
    if (!lgu) return;
    setBusy('template');
    try {
      saveAs(await inventoryTemplate(lgu.label, barangaysOf(lgu.name)), `Green Tag tree inventory - ${lgu.name}.xlsx`);
    } finally {
      setBusy('');
    }
  }

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !lgu) return;
    setBusy('reading');
    setRead(null);
    setOutcome(null);
    try {
      const [rows] = await Promise.all([rowsOfFile(file), loadBarangayIndex().catch(() => null)]);
      if (rows.length - 1 > MAX_ROWS) {
        setOutcome({ ok: false, text: `That file has over ${MAX_ROWS.toLocaleString('en-US')} rows. Split it and bring each part in.` });
        return;
      }
      setRead({ name: file.name, ...readInventory(rows, { lguName: lgu.name, barangayAt }) });
    } catch (failure) {
      setOutcome({ ok: false, text: `The file could not be read: ${failure.message}` });
    } finally {
      setBusy('');
    }
  }

  async function bringIn() {
    setBusy('saving');
    setOutcome(null);
    // What this LGU has brought in before, so a second upload adds nothing twice.
    const { data: before, error: beforeError } = await everyRow(() =>
      supabase.from('pending_trees').select('id, species, latitude, longitude, details').eq('source', 'import').eq('lgu_psgc', lgu.psgc)
    );
    if (beforeError && isMissingColumn(beforeError)) {
      setBusy('');
      setOutcome({ ok: false, text: 'Bringing in an inventory needs supabase/community.sql, which has not been run yet.' });
      return;
    }
    const { fresh, repeated } = notYetImported(read.trees, Array.isArray(before) ? before : []);
    const rows = fresh.map((tree) => inventoryRow(tree, { lguName: lgu.name, fileName: read.name }));
    const skipped = repeated ? ` ${count(repeated, 'tree was', 'trees were')} already in, from an earlier upload, and left out.` : '';
    let saved = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from('pending_trees').insert(rows.slice(i, i + BATCH));
      if (error) {
        setBusy('');
        setOutcome({
          ok: false,
          text: isMissingColumn(error)
            ? 'Bringing in an inventory needs supabase/community.sql, which has not been run yet.'
            : `${saved ? `${count(saved, 'tree')} came in, then ` : ''}the rest could not: ${error.message}`,
        });
        if (saved) setRead(null);
        return;
      }
      saved += Math.min(BATCH, rows.length - i);
    }
    setBusy('');
    setRead(null);
    setOutcome({
      ok: true,
      text: saved
        ? `${count(saved, 'tree')} came in for ${lgu.label}. Each is grey on the map until a field officer verifies it.${skipped}`
        : `Nothing new: every tree in the file is already in.${skipped}`,
    });
  }

  const body = (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Already have an inventory? Put it in the standard spreadsheet and bring it in. Its trees show grey on the map until a
        field officer visits each one, takes its photos and verifies it.
      </p>
      {pgenro && !ownLgu && (
        <label className="block max-w-sm text-sm font-semibold text-slate-700">
          For which city or municipality
          <select value={chosen} onChange={choose}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal">
            <option value="">Choose one…</option>
            {MUNICIPALITY_LIST.map((item) => <option key={item.psgc} value={item.psgc}>{item.label}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-500">
            PGENRO brings an LGU&apos;s inventory in for it; its trees are that LGU&apos;s to verify.
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadTemplate} disabled={Boolean(busy) || !lgu} className={`${buttonClass} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
          {busy === 'template' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
          Download the template
        </button>
        <button type="button" onClick={() => input.current?.click()} disabled={Boolean(busy) || !lgu} className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
          {busy === 'reading' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileUp size={15} aria-hidden="true" />}
          Choose a filled spreadsheet
        </button>
        <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" onChange={pick} aria-label="Tree inventory spreadsheet" />
      </div>
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-green-700" aria-hidden="true" />
        Only the template&apos;s columns are read. An owner&apos;s name or any other column is left in the file, and a remark
        that reads like a person&apos;s name is blanked (RA 10173). The file itself is not uploaded.
      </p>

      {read && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" aria-label="What the spreadsheet holds">
          {read.missing.length > 0 ? (
            <p role="alert" className="text-sm text-red-700">
              {read.name} has no {read.missing.join(', ')} column. Use the template&apos;s headings.
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <TreePine size={16} className="text-green-700" aria-hidden="true" />
                {read.name}: {count(read.trees.length, 'tree')} ready to bring in
                {read.problems.length > 0 && `, ${count(read.problems.length, 'row')} to look at`}
              </p>
              {read.personal.length > 0 && (
                <p className="text-xs text-slate-600">Left out as personal data: {read.personal.join(', ')}.</p>
              )}
              {read.ignored.length > 0 && (
                <p className="text-xs text-slate-600">Columns not in the template, not read: {read.ignored.join(', ')}.</p>
              )}
              {read.problems.length > 0 && (
                <ul className="max-h-48 list-disc space-y-1 overflow-auto pl-5 text-xs text-amber-900" aria-label="Rows to look at">
                  {groupProblems(read.problems).map((group) => (
                    <li key={group.text}>
                      <span className="font-semibold">{count(group.rows.length, 'row')}:</span> {group.text}{' '}
                      <span className="text-amber-700">
                        ({group.rows.length === 1 ? 'row' : 'rows'} {group.rows.slice(0, 12).join(', ')}{group.rows.length > 12 ? ', …' : ''})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {read.trees.length > 0 && (
                <button type="button" onClick={bringIn} disabled={Boolean(busy)} className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
                  {busy === 'saving' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                  Bring in {count(read.trees.length, 'tree')}
                </button>
              )}
            </>
          )}
        </div>
      )}
      <Outcome outcome={outcome} />
    </div>
  );

  if (bare) return body;
  return (
    <Section
      title="Tree inventory"
      description={ownLgu ? `${ownLgu.label}'s existing inventory, from the standard spreadsheet` : 'An LGU’s existing inventory, brought in for it from the standard spreadsheet'}
    >
      {body}
    </Section>
  );
}
