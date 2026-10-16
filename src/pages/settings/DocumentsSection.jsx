import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, FileUp, Loader2, MapPinned } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { designationById, namriaClassById } from '../../lib/namriaCover.js';
import { removeDocument } from '../../lib/mapAreas.js';
import Section, { Outcome } from './Section.jsx';

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/**
 * The documents behind the office's legally designated areas — a protected
 * area's proclamation, a zoning ordinance — each to open, or to replace with
 * a newer issue. Designating an area, and drawing it, stay on the map.
 */
export default function DocumentsSection({ office, pgenro }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const picker = useRef(null);
  const [replacing, setReplacing] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('map_areas').select('*').eq('created_by_role', pgenro ? 'pgenro' : 'lgu_admin');
      if (cancelled) return;
      setRows(
        (Array.isArray(data) ? data : [])
          .filter((row) => row.designation && (pgenro || String(row.lgu_psgc) === office))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [office, pgenro]);

  async function replace(row, file) {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      setOutcome({ ok: false, text: 'The document must be a PDF.' });
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setOutcome({ ok: false, text: 'That PDF is over 20 MB.' });
      return;
    }
    setBusy(row.id);
    setOutcome(null);
    const path = `${office}/${crypto.randomUUID()}.pdf`;
    const uploaded = await supabase.storage.from('area-documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (uploaded.error) {
      setBusy(null);
      setOutcome({ ok: false, text: `The document could not be uploaded: ${uploaded.error.message}` });
      return;
    }
    const url = supabase.storage.from('area-documents').getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from('map_areas').update({ doc_url: url }).eq('id', row.id);
    if (error) {
      await removeDocument(supabase, url);
      setBusy(null);
      setOutcome({ ok: false, text: error.message });
      return;
    }
    // The old issue is replaced, so it does not stay online.
    await removeDocument(supabase, row.doc_url);
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, doc_url: url } : r)));
    setBusy(null);
    setOutcome({ ok: true, text: `${row.name}: document replaced.` });
  }

  return (
    <Section title="Legal documents" description="The ordinances and proclamations behind designated areas">
      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          No area has a legal designation yet. Designate one when saving it on the map — it then asks for its document.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Documents are published on the website for anyone to read: replace one only with a public document.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Area</th>
                  <th scope="col" className="px-3 py-2">Classification</th>
                  <th scope="col" className="px-3 py-2">Designation</th>
                  <th scope="col" className="px-3 py-2">Document</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <th scope="row" className="px-3 py-2 font-semibold text-slate-800">{row.name}</th>
                    <td className="px-3 py-2 text-slate-600">
                      {row.kind === 'planting-site' ? 'Tree planting site' : namriaClassById(row.cover_class)?.label ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{designationById(row.designation)?.label ?? row.designation}</td>
                    <td className="px-3 py-2">
                      {row.doc_url ? (
                        <a href={row.doc_url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 text-green-800 hover:underline">
                          <FileText size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                          <span>
                            {[row.doc_type, row.doc_number && `No. ${row.doc_number}`].filter(Boolean).join(' ')}
                            <span className="block text-xs text-slate-500">{row.doc_title}</span>
                          </span>
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => {
                            setReplacing(row);
                            picker.current?.click();
                          }}
                          aria-label={`Replace the document of ${row.name}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busy === row.id ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <FileUp size={13} aria-hidden="true" />}
                          Replace PDF
                        </button>
                        <Link to={`/map?area=${encodeURIComponent(row.id)}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
                          <MapPinned size={13} aria-hidden="true" /> On the map
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <input
            ref={picker}
            type="file"
            accept="application/pdf"
            className="hidden"
            aria-label="Replacement document (PDF)"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (replacing) replace(replacing, file);
            }}
          />
          <Outcome outcome={outcome} />
        </div>
      )}
    </Section>
  );
}
