import { useState } from 'react';
import { Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { proposalChanges, removeDocument } from '../../lib/mapAreas.js';

const button =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition disabled:opacity-50';

/**
 * What an office can do to a saved area, at the foot of its panel.
 *
 *   permission 'edit'     its own area: Edit, Delete — and, with a PGENRO
 *                         proposal waiting, Approve or Decline it
 *   permission 'propose'  PGENRO on an office's area: Propose a change, or
 *                         see its proposal waiting and withdraw it
 *
 * The database checks every one of these again (map_areas.sql); the buttons
 * only save asking for something that would be refused.
 */
export default function AreaActions({ feature, row, permission, proposal = null, onEdit, onPropose, onChanged, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const name = feature?.properties?.name ?? 'this area';

  if (!permission) return null;

  async function run(label, action, after) {
    setBusy(label);
    setError('');
    const { error: failure } = await action();
    setBusy('');
    if (failure) {
      setError(failure.message ?? 'That did not go through.');
      return;
    }
    after?.();
  }

  const remove = () =>
    run('delete', () => supabase.from('map_areas').delete().eq('id', row.id), async () => {
      // The area is gone, so its document should not stay online.
      await removeDocument(supabase, row.doc_url);
      onDeleted?.();
    });
  const approve = () =>
    run('approve', () => supabase.rpc('approve_area_proposal', { p_id: proposal.id, p_note: null }), () => onChanged?.('approved'));
  const decline = () =>
    run('decline', () => supabase.rpc('decline_area_proposal', { p_id: proposal.id, p_note: note.trim() || null }), () => onChanged?.('declined'));
  const withdraw = () =>
    run('withdraw', () => supabase.from('map_area_proposals').delete().eq('id', proposal.id), () => onChanged?.('withdrawn'));

  const changes = proposal ? proposalChanges(row, proposal.changes) : [];

  return (
    <div className="space-y-3">
      {proposal && permission === 'edit' && (
        <section aria-label="PGENRO's proposal" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px]">
          <p className="font-bold text-amber-900">PGENRO proposes a change</p>
          {changes.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {changes.map((change) => (
                <li key={change.key} className="text-amber-900">
                  <span className="font-semibold">{change.label}:</span> {change.before} → <strong>{change.after}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-amber-900/80">No field differs from the area as it is now.</p>
          )}
          {proposal.note && <p className="mt-1.5 italic text-amber-900/80">“{proposal.note}”</p>}

          {declining ? (
            <div className="mt-2 space-y-2">
              <label className="block text-[11.5px] font-semibold text-amber-900">
                Why not? (optional, PGENRO sees it)
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[12px]" />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDeclining(false)}
                  className={`${button} flex-1 bg-white text-slate-600 ring-1 ring-slate-200`}>Back</button>
                <button type="button" onClick={decline} disabled={Boolean(busy)}
                  className={`${button} flex-1 bg-red-600 text-white hover:bg-red-700`}>
                  {busy === 'decline' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setDeclining(true)}
                className={`${button} flex-1 bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}>
                Decline…
              </button>
              <button type="button" onClick={approve} disabled={Boolean(busy)}
                className={`${button} flex-1 bg-green-700 text-white hover:bg-green-800`}>
                {busy === 'approve' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                Approve and apply
              </button>
            </div>
          )}
        </section>
      )}

      {proposal && permission === 'propose' && (
        <section aria-label="Your proposal" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
          <p className="font-bold">Your proposal is waiting for the MENRO / CENRO.</p>
          <button type="button" onClick={withdraw} disabled={Boolean(busy)}
            className="mt-1.5 text-[12px] font-semibold text-amber-900 underline">
            Withdraw it
          </button>
        </section>
      )}

      {confirming ? (
        <div role="alertdialog" aria-label={`Delete ${name}?`} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-900">
          <p className="font-bold">Delete {name}?</p>
          <p className="mt-0.5">It leaves the map for everyone. This cannot be undone.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setConfirming(false)}
              className={`${button} flex-1 bg-white text-slate-600 ring-1 ring-slate-200`}>Keep it</button>
            <button type="button" onClick={remove} disabled={Boolean(busy)}
              className={`${button} flex-1 bg-red-600 text-white hover:bg-red-700`}>
              {busy === 'delete' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {permission === 'edit' && (
            <>
              <button type="button" onClick={onEdit} className={`${button} flex-1 bg-green-700 text-white hover:bg-green-800`}>
                <Pencil size={14} aria-hidden="true" /> Edit
              </button>
              <button type="button" onClick={() => setConfirming(true)}
                className={`${button} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`}>
                <Trash2 size={14} aria-hidden="true" /> Delete
              </button>
            </>
          )}
          {permission === 'propose' && !proposal && (
            <button type="button" onClick={onPropose} className={`${button} flex-1 bg-green-700 text-white hover:bg-green-800`}>
              <Send size={14} aria-hidden="true" /> Propose a change
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
    </div>
  );
}
