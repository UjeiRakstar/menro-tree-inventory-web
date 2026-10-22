import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Lock, Search } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { speciesInInventory } from '../lib/treeDatabase.js';
import SpeciesFacts from './public/SpeciesFacts.jsx';

const ERDB_LINK = 'https://erdbservices.denr.gov.ph/eskris/iec_for_guest.php';

const paragraphsOf = (text) =>
  String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * The Tree Database, on an office's Trees page (22 October): every species
 * tagged in its LGU, with what PGENRO has written of it from DENR-ERDB's RISE
 * publications. Read-only: the write-ups are PGENRO's to keep. A species
 * comes on the list when a tree of it is tagged in the LGU — the same moment
 * it comes on the map — and only then.
 *
 *   trees    the LGU's tagged trees — or, on the public page, Laguna's
 *   place    its name, for the headings
 *   bare     the page has its own title (the public Tree Database)
 */
export default function TreeDatabase({ trees, place = 'this LGU', bare = false }) {
  const [profiles, setProfiles] = useState(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('species_profiles').select('*');
      if (cancelled) return;
      setFailed(Boolean(error));
      setProfiles(!error && Array.isArray(data) ? data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const species = useMemo(() => speciesInInventory(trees, profiles ?? []), [trees, profiles]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? species.filter((s) => `${s.name} ${s.scientific}`.toLowerCase().includes(q)) : species;
  }, [species, query]);
  const open = species.find((s) => s.name === chosen) ?? shown[0] ?? null;
  const written = species.filter((s) => s.profile).length;

  if (profiles === null) return <p className="text-sm text-slate-500">Loading the tree database…</p>;

  return (
    <section aria-label="Tree Database" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!bare && (
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <BookOpen size={18} className="text-green-700" aria-hidden="true" /> Tree Database
            </h2>
          )}
          <p className="mt-0.5 text-sm text-slate-600">
            {species.length} {species.length === 1 ? 'species' : 'species'} tagged in {place}; {written} with a write-up
            from the RISE publications of DENR-ERDB.
          </p>
        </div>
        <p className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
          <Lock size={12} aria-hidden="true" /> {bare ? 'Kept by PGENRO Laguna' : 'Kept by PGENRO — read-only here'}
        </p>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-amber-800">The write-ups could not be read just now; the species are listed without them.</p>
      )}

      {species.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No tree tagged in {place} yet. A species is listed here once a tree of it is tagged.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a species…"
                aria-label="Find a species"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
            <ul aria-label="Species tagged" className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {shown.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => setChosen(s.name)}
                    aria-current={open?.name === s.name ? 'true' : undefined}
                    className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left ${
                      open?.name === s.name ? 'bg-green-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{s.name}</span>
                      {s.scientific && <span className="block truncate text-xs italic text-slate-500">{s.scientific}</span>}
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-slate-500">
                      {s.count.toLocaleString('en-US')} {s.count === 1 ? 'tree' : 'trees'}
                      {!s.profile && <span className="block text-amber-700">No write-up yet</span>}
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No species match.</li>}
            </ul>
          </div>

          {open && (
            <article aria-label={open.name} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
              <header>
                <h3 className="text-xl font-bold text-green-900">{open.name}</h3>
                {open.scientific && <p className="text-sm italic text-slate-600">{open.scientific}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {open.count.toLocaleString('en-US')} tagged {open.count === 1 ? 'tree' : 'trees'} in {place}
                </p>
              </header>
              {open.profile ? (
                <>
                  {paragraphsOf(open.profile.description).map((paragraph, i) => (
                    <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                      {paragraph}
                    </p>
                  ))}
                  <SpeciesFacts profile={open.profile} />
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  PGENRO has not written this species up from the RISE publications yet. It is listed because a tree of it is
                  tagged in {place}.
                </p>
              )}
              <p className="border-t border-slate-100 pt-3 text-[11px] italic leading-relaxed text-slate-500">
                From DENR-ERDB’s RISE publications, through the ERDB Services and Knowledge Resources Integrated System (
                <a href={ERDB_LINK} target="_blank" rel="noreferrer" className="break-all text-blue-600 underline">
                  {ERDB_LINK}
                </a>
                ), as PGENRO entered it.
              </p>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
