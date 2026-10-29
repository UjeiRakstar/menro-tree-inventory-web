import { useState } from 'react';
import { AlertTriangle, Apple, Archive, CheckCircle2, Flower2, Loader2, Send, TreeDeciduous, TreePine, X } from 'lucide-react';
import { ARCHIVE_REASONS, archiveReason, healthWarnings, placeOfTree, taggedBy, totalHeightText } from '../../lib/treeRows.js';
import { treeClassOf } from '../../lib/mapSheet.js';

const th = 'px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600';

/** Each tree's class by its use, as an outline icon (29 October), in place of its photo. */
const CLASS_ICONS = {
  fruit: { icon: Apple, label: 'Fruit tree', tone: 'text-orange-600 ring-orange-200 bg-orange-50' },
  ornamental: { icon: Flower2, label: 'Ornamental tree', tone: 'text-pink-600 ring-pink-200 bg-pink-50' },
  timber: { icon: TreePine, label: 'Timber tree', tone: 'text-green-700 ring-green-200 bg-green-50' },
  unrecorded: { icon: TreeDeciduous, label: 'Class not recorded', tone: 'text-slate-400 ring-slate-200 bg-slate-50' },
};

/** The class icon; with a photo on record, it opens the photo. */
function ClassIcon({ tree, onPhoto }) {
  const { icon: Icon, label, tone } = CLASS_ICONS[treeClassOf(tree, 'use')] ?? CLASS_ICONS.unrecorded;
  const photoUrl = tree.photo_url || tree.imageUrl;
  const box = `flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${tone}`;
  if (photoUrl && onPhoto) {
    return (
      <button type="button" onClick={() => onPhoto(photoUrl)} title={`${label} — view the photo`} aria-label={`${label} — view the photo`} className={`${box} hover:ring-2`}>
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }
  return (
    <span title={label} className={box}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Green when healthy; red when not, opening its warnings in a small pop-up. */
function Health({ tree }) {
  const [open, setOpen] = useState(false);
  const warnings = healthWarnings(tree);
  if (warnings.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800 ring-1 ring-green-200">
        <CheckCircle2 size={12} aria-hidden="true" /> Healthy
      </span>
    );
  }
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Not healthy: ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`}
        className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
      >
        <AlertTriangle size={12} aria-hidden="true" /> Not healthy
      </button>
      {open && (
        <span role="dialog" aria-label="Warnings" className="absolute left-0 top-full z-20 mt-1 block w-56 rounded-lg bg-white p-3 text-left shadow-lg ring-1 ring-slate-200">
          <span className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-red-700">
            Warnings
            <button type="button" onClick={() => setOpen(false)} aria-label="Close the warnings" className="text-slate-400 hover:text-slate-700">
              <X size={12} aria-hidden="true" />
            </button>
          </span>
          <ul className="space-y-0.5">
            {warnings.map((w) => (
              <li key={w} className="text-xs text-slate-700">• {w}</li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}

/**
 * The inventory as a table (22 October): Class | Species | Barangay or LGU |
 * DBH | Total height | Health | Date | Tagged by — and, for an office,
 * Assigned to and its actions: dispatch for a tree that is not healthy, and
 * archive.
 *
 *   province   PGENRO's view: the LGU, not the barangay; no actions
 *   people     account id → name, for who tagged it
 *   officers   email → name, for who it is assigned to
 */
export default function InventoryTable({ rows, province = false, people, officers, onOpen, onPhoto, onSort, onDispatch, onArchive }) {
  const office = !province;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200" aria-label="Tree inventory">
        <thead className="bg-slate-50">
          <tr>
            <th className={th}>Class</th>
            <th className={`${th} cursor-pointer`} onClick={() => onSort?.('species')}>Species</th>
            <th className={th}>{province ? 'City / municipality' : 'Barangay'}</th>
            <th className={`${th} cursor-pointer`} onClick={() => onSort?.('dbh')}>DBH</th>
            <th className={`${th} cursor-pointer`} onClick={() => onSort?.('total_height')}>Total height</th>
            <th className={th}>Health</th>
            <th className={`${th} cursor-pointer`} onClick={() => onSort?.('dateCaptured')}>Date recorded</th>
            <th className={th}>Tagged by</th>
            {office && <th className={th}>Assigned to</th>}
            {office && <th className={th}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((tree) => {
            const by = taggedBy(tree, { province, people });
            const unhealthy = healthWarnings(tree).length > 0;
            const assignee = tree.assigned_to ? officers?.get(String(tree.assigned_to).toLowerCase()) ?? tree.assigned_to : null;
            return (
              <tr key={tree.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen?.(tree)}>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <ClassIcon tree={tree} onPhoto={onPhoto} />
                </td>
                <td className="px-3 py-2 text-sm">
                  <span className="font-medium text-slate-900">{tree.species || '—'}</span>
                  {tree.tree_id && <span className="block text-[11px] text-slate-400">{tree.tree_id}</span>}
                </td>
                <td className="px-3 py-2 text-sm text-slate-700">{placeOfTree(tree, { province })}</td>
                <td className="px-3 py-2 text-sm text-slate-700">{tree.dbh || '—'}</td>
                <td className="px-3 py-2 text-sm text-slate-700">{totalHeightText(tree)}</td>
                <td className="px-3 py-2 text-sm" onClick={(e) => e.stopPropagation()}><Health tree={tree} /></td>
                <td className="px-3 py-2 text-xs text-slate-500">{tree.dateCaptured ? new Date(tree.dateCaptured).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {by.label}
                  {by.kind === 'officer' && office && !by.named && <span className="block text-[10px] text-slate-400">name not recorded</span>}
                </td>
                {office && (
                  <td className="px-3 py-2 text-xs text-slate-700">
                    {assignee ?? <span className="text-slate-400">—</span>}
                    {assignee && tree.task_status && <span className="block text-[10px] text-slate-400">{tree.task_status}</span>}
                  </td>
                )}
                {office && (
                  <td className="whitespace-nowrap px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {unhealthy && (
                      <button type="button" onClick={() => onDispatch?.(tree)} aria-label={`${assignee ? 'Re-assign' : 'Dispatch'} for ${tree.species || 'this tree'}`}
                        className="mr-2 inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">
                        <Send size={11} aria-hidden="true" /> {assignee ? 'Re-assign' : 'Dispatch'}
                      </button>
                    )}
                    <button type="button" onClick={() => onArchive?.(tree)} aria-label={`Archive ${tree.species || 'this tree'}`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                      <Archive size={11} aria-hidden="true" /> Archive
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Archiving a tree: why, chosen and noted. Not a delete — it can be put back. */
export function ArchiveTreeDialog({ tree, onCancel, onArchive }) {
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const reason = archiveReason(choice, note);

  async function submit(event) {
    event.preventDefault();
    if (!choice || (choice === 'Other' && !note.trim())) {
      setProblem(choice === 'Other' ? 'Say why.' : 'Choose why it is archived.');
      return;
    }
    setBusy(true);
    setProblem('');
    const failure = await onArchive(tree, reason);
    setBusy(false);
    if (failure) setProblem(failure);
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <form role="dialog" aria-label="Archive the tree" onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">Archive {tree.species || 'this tree'}?</h3>
        <p className="text-sm text-slate-600">
          It leaves the map, the dashboards and the reports, and stays on record here under Archived, where it can be put
          back. It is not deleted.
        </p>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold text-slate-700">Why</legend>
          {ARCHIVE_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="archive-reason" checked={choice === r} onChange={() => setChoice(r)} /> {r}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-semibold text-slate-700">
          Note {choice === 'Other' ? '' : '(optional)'}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
            placeholder="e.g. permit number, date"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
        </label>
        {problem && <p role="alert" className="text-sm text-red-700">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />} Archive it
          </button>
        </div>
      </form>
    </div>
  );
}
