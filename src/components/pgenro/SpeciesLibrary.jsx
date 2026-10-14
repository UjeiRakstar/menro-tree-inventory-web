import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { emptyRiseForm, formFromProfile } from '../../lib/riseFields.js';
import SpeciesEditor from './SpeciesEditor.jsx';

/**
 * The Trees page's Species (RISE) tab: what each species' DENR-ERDB RISE
 * issue says, kept by the PGENRO forester.
 *
 * The description written here is what the public map's tree panel shows.
 * Species already tagged in the field with no write-up yet are listed first,
 * so the backlog is visible and one tap away.
 */
export default function SpeciesLibrary({ trees = [] }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // { form, isNew }
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('species_profiles').select('*').order('species');
    setLoadError(error ? error.message : '');
    setProfiles(error ? [] : data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Every species name the field app has recorded, with how many trees.
  const tagged = useMemo(() => {
    const counts = new Map();
    for (const tree of trees) {
      const name = (tree.species ?? '').trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [trees]);

  const written = useMemo(() => new Set(profiles.map((p) => p.species.toLowerCase())), [profiles]);
  const backlog = useMemo(
    () =>
      [...tagged.entries()]
        .filter(([name]) => !written.has(name.toLowerCase()))
        .sort((a, b) => b[1] - a[1]),
    [tagged, written]
  );

  const q = query.trim().toLowerCase();
  const shown = profiles.filter(
    (p) =>
      !q ||
      p.species.toLowerCase().includes(q) ||
      (p.scientific_name ?? '').toLowerCase().includes(q) ||
      (p.family ?? '').toLowerCase().includes(q)
  );

  if (editing) {
    return (
      <SpeciesEditor
        key={editing.form.species || 'new'}
        initial={editing.form}
        isNew={editing.isNew}
        knownSpecies={[...tagged.keys()].sort()}
        takenNames={profiles.map((p) => p.species)}
        onBack={() => setEditing(null)}
        onSaved={(row) => {
          setEditing(null);
          setNotice(`${row.species} saved. The public map shows its description from now on.`);
          load();
        }}
      />
    );
  }

  const startNew = (species = '') => setEditing({ form: { ...emptyRiseForm(), species }, isNew: true });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <BookOpen size={20} className="text-green-700" aria-hidden="true" /> Species, from RISE
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            What each species&rsquo; DENR-ERDB RISE issue says. The description is what the public map shows
            when someone opens a tree.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startNew()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800"
        >
          <Plus size={16} aria-hidden="true" /> Add a species
        </button>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {notice}
        </p>
      )}

      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin text-green-700" aria-hidden="true" /> Loading species…
        </p>
      ) : loadError ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </p>
      ) : (
        <>
          {backlog.length > 0 && (
            <section aria-label="Tagged, no write-up yet" className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <p className="text-sm font-bold text-amber-900">
                Tagged in the field, no write-up yet ({backlog.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {backlog.map(([name, count]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => startNew(name)}
                    aria-label={`Write up ${name}`}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-amber-200 hover:bg-amber-50"
                  >
                    {name} <span className="font-normal text-slate-500">· {count}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a species, scientific name or family"
              aria-label="Find a species"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-slate-500">
              {profiles.length === 0 ? 'No species written up yet.' : `No species matches “${query}”.`}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {shown.map((profile) => (
                <li key={profile.species}>
                  <button
                    type="button"
                    onClick={() => setEditing({ form: formFromProfile(profile), isNew: false })}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="font-semibold text-slate-900">{profile.species}</span>
                    {profile.scientific_name && (
                      <span className="text-sm italic text-slate-500">{profile.scientific_name}</span>
                    )}
                    {profile.family && <span className="text-xs text-slate-500">{profile.family}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      {profile.autofilled && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800"
                          title="Filled in from the PDF, then checked"
                        >
                          <Sparkles size={11} aria-hidden="true" /> Read from PDF
                        </span>
                      )}
                      {profile.rise_citation && (
                        <span className="text-xs text-slate-500">{profile.rise_citation}</span>
                      )}
                      {tagged.has(profile.species) && (
                        <span className="text-xs text-slate-400">
                          {tagged.get(profile.species)} tagged
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
