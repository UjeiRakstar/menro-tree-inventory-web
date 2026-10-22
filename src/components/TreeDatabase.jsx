import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Eye, EyeOff, ImageIcon, Lock, Search, Star } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { brochureOf, photoKey, speciesInInventory } from '../lib/treeDatabase.js';
import { sizedPhoto } from '../lib/photoSize.js';
import SpeciesFacts from './public/SpeciesFacts.jsx';

const ERDB_LINK = 'https://erdbservices.denr.gov.ph/eskris/iec_for_guest.php';

const paragraphsOf = (text) =>
  String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** PostgREST's answer when species_photos.sql has not been run. */
const isMissingTable = (error) => /species_photo_choices|relation .* does not exist|PGRST205/i.test(error?.message ?? error?.code ?? '');

/**
 * The Tree Database, on an office's Trees page (22 October): every species
 * tagged in its LGU, with what PGENRO has written of it from DENR-ERDB's RISE
 * publications. Read-only: the write-ups are PGENRO's to keep. A species
 * comes on the list when a tree of it is tagged in the LGU — the same moment
 * it comes on the map — and only then.
 *
 * Each species shows the photos of its tagged trees, as a brochure: a cover
 * and a strip of leaves, bark and fruits, from the field officers' photos only
 * (brochureOf in treeDatabase.js).
 *
 *   trees         the LGU's tagged trees — or, on the public page, Laguna's
 *   place         its name, for the headings
 *   bare          the page has its own title (the public Tree Database)
 *   placeOf       where a tree stands (its LGU for the public, its barangay for
 *                 an office), for "Where it is tagged"; placesLabel names them
 *   choosePhotos  PGENRO: choose each species' cover, hide a photo
 */
export default function TreeDatabase({
  trees,
  place = 'this LGU',
  bare = false,
  placeOf = null,
  placesLabel = 'Where it is tagged',
  choosePhotos = false,
}) {
  const [profiles, setProfiles] = useState(null);
  const [failed, setFailed] = useState(false);
  const [choices, setChoices] = useState(() => new Map());
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [written, photoChoices] = await Promise.all([
        supabase.from('species_profiles').select('*'),
        supabase.from('species_photo_choices').select('*'),
      ]);
      if (cancelled) return;
      setFailed(Boolean(written.error));
      setProfiles(!written.error && Array.isArray(written.data) ? written.data : []);
      // Before species_photos.sql, there are no choices: the page picks.
      const rows = !photoChoices.error && Array.isArray(photoChoices.data) ? photoChoices.data : [];
      setChoices(new Map(rows.map((row) => [row.species, row])));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const species = useMemo(() => speciesInInventory(trees, profiles ?? [], { placeOf }), [trees, profiles, placeOf]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? species.filter((s) => `${s.name} ${s.scientific}`.toLowerCase().includes(q)) : species;
  }, [species, query]);
  const open = species.find((s) => s.name === chosen) ?? shown[0] ?? null;
  const written = species.filter((s) => s.profile).length;
  const choiceOf = (s) => choices.get(photoKey(s.name)) ?? null;

  const saveChoice = useCallback(
    async (name, change) => {
      const keyed = photoKey(name);
      const before = choices.get(keyed) ?? { species: keyed, cover_url: null, hidden_urls: [] };
      const next = { ...before, ...change, species: keyed };
      const { error } = await supabase
        .from('species_photo_choices')
        .upsert({ species: keyed, cover_url: next.cover_url, hidden_urls: next.hidden_urls }, { onConflict: 'species' });
      if (error) {
        return isMissingTable(error)
          ? 'Choosing photos needs supabase/species_photos.sql (step 34 of PARKED.md) run first.'
          : `The choice was not saved: ${error.message}`;
      }
      setChoices((map) => new Map(map).set(keyed, next));
      return '';
    },
    [choices]
  );

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
          <Lock size={12} aria-hidden="true" />{' '}
          {choosePhotos ? 'Write-ups in Species (RISE); photos chosen here' : bare ? 'Kept by PGENRO Laguna' : 'Kept by PGENRO — read-only here'}
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
              {shown.map((s) => {
                const cover = brochureOf(s, choiceOf(s)).cover;
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => setChosen(s.name)}
                      aria-current={open?.name === s.name ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                        open?.name === s.name ? 'bg-green-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      {cover ? (
                        <img
                          src={sizedPhoto(cover.url, 96)}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700 ring-1 ring-green-100">
                          <ImageIcon size={16} aria-hidden="true" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{s.name}</span>
                        {s.scientific && <span className="block truncate text-xs italic text-slate-500">{s.scientific}</span>}
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-slate-500">
                        {s.count.toLocaleString('en-US')} {s.count === 1 ? 'tree' : 'trees'}
                        {!s.profile && <span className="block text-amber-700">No write-up yet</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No species match.</li>}
            </ul>
          </div>

          {open && (
            <article aria-label={open.name} className="space-y-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Brochure species={open} choice={choiceOf(open)} />
              <div className="space-y-3 px-5 pb-5">
                <header className={brochureOf(open, choiceOf(open)).cover ? '' : 'pt-5'}>
                  <h3 className="text-xl font-bold text-green-900">{open.name}</h3>
                  {open.scientific && <p className="text-sm italic text-slate-600">{open.scientific}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    {open.count.toLocaleString('en-US')} tagged {open.count === 1 ? 'tree' : 'trees'} in {place}
                  </p>
                </header>
                {open.places?.length > 0 && (
                  <section aria-label={placesLabel} className="rounded-lg bg-green-50/60 p-3 ring-1 ring-green-100">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-green-800">{placesLabel}</h4>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {open.places.map((p) => (
                        <li key={p.name} className="rounded-full bg-white px-2.5 py-0.5 text-xs text-slate-700 ring-1 ring-green-200">
                          {p.name} <span className="font-semibold text-green-800">{p.count.toLocaleString('en-US')}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
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
                {choosePhotos && (
                  <PhotoChooser key={open.name} species={open} choice={choiceOf(open)} onSave={(change) => saveChoice(open.name, change)} />
                )}
                <p className="border-t border-slate-100 pt-3 text-[11px] italic leading-relaxed text-slate-500">
                  From DENR-ERDB’s RISE publications, through the ERDB Services and Knowledge Resources Integrated System (
                  <a href={ERDB_LINK} target="_blank" rel="noreferrer" className="break-all text-blue-600 underline">
                    {ERDB_LINK}
                  </a>
                  ), as PGENRO entered it. Photos: the field officers’ own, of trees tagged in Laguna.
                </p>
              </div>
            </article>
          )}
        </div>
      )}
    </section>
  );
}

/** The species' cover across the top of its card, and the strip under it. */
function Brochure({ species, choice }) {
  const { cover, strip } = brochureOf(species, choice);
  if (!cover) return null;
  return (
    <figure aria-label={`Photos of ${species.name}`}>
      <a href={sizedPhoto(cover.url, 1600)} target="_blank" rel="noreferrer" className="block bg-slate-100">
        <img
          src={sizedPhoto(cover.url, 900)}
          alt={`${species.name} — ${cover.kind === 'Main' ? 'the tree' : cover.kind.toLowerCase()}`}
          className="aspect-[16/9] w-full object-cover"
        />
      </a>
      {strip.length > 0 && (
        <ul aria-label="Leaves, bark and fruits" className="flex gap-2 overflow-x-auto px-5 pt-3">
          {strip.map((photo) => (
            <li key={photo.url} className="shrink-0">
              <a href={sizedPhoto(photo.url, 1600)} target="_blank" rel="noreferrer" className="block">
                <img
                  src={sizedPhoto(photo.url, 240)}
                  alt={`${species.name} — ${photo.kind.toLowerCase()}`}
                  loading="lazy"
                  className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200"
                />
                <span className="mt-0.5 block text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {photo.kind}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/**
 * PGENRO's say over a species' photos: which one is the cover, and which are
 * never shown — a face or a house in it, a blurred one, a wrong one.
 */
function PhotoChooser({ species, choice, onSave }) {
  const { cover, shown, hidden } = brochureOf(species, choice);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const hiddenUrls = Array.isArray(choice?.hidden_urls) ? choice.hidden_urls : [];

  const save = async (change) => {
    setBusy(true);
    setMessage(await onSave(change));
    setBusy(false);
  };

  return (
    <section aria-label="Choose the photos" className="rounded-lg border border-dashed border-green-300 bg-green-50/40 p-3">
      <h4 className="text-xs font-bold uppercase tracking-wide text-green-800">Choose the photos (PGENRO)</h4>
      <p className="mt-0.5 text-xs text-slate-600">
        The field officers’ photos of {species.name}. Pick the cover the public sees first; hide any that shows a person, a
        house, or is not this species.
      </p>
      {message && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {message}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No photo to choose from.</p>
      ) : (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((photo) => (
            <li key={photo.url} className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
              <img src={sizedPhoto(photo.url, 240)} alt={`${species.name} — ${photo.kind.toLowerCase()}`} loading="lazy" className="aspect-square w-full object-cover" />
              <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                <span className="text-[10px] font-semibold uppercase text-slate-500">{photo.kind}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    disabled={busy || cover?.url === photo.url}
                    onClick={() => save({ cover_url: photo.url })}
                    aria-label={`Make the cover: ${photo.kind}`}
                    title="Make the cover"
                    className="rounded p-1 text-amber-600 hover:bg-amber-50 disabled:text-amber-400 disabled:opacity-70"
                  >
                    <Star size={14} fill={cover?.url === photo.url ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => save({ hidden_urls: [...hiddenUrls, photo.url] })}
                    aria-label={`Hide: ${photo.kind}`}
                    title="Hide this photo"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <EyeOff size={14} aria-hidden="true" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hidden.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">Hidden ({hidden.length})</summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {hidden.map((photo) => (
              <li key={photo.url} className="flex items-center gap-1.5 rounded-lg bg-white p-1 ring-1 ring-slate-200">
                <img src={sizedPhoto(photo.url, 96)} alt={`${species.name} — ${photo.kind.toLowerCase()}, hidden`} loading="lazy" className="h-10 w-10 rounded object-cover opacity-60" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save({ hidden_urls: hiddenUrls.filter((url) => url !== photo.url) })}
                  aria-label={`Show again: ${photo.kind}`}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  <Eye size={12} aria-hidden="true" /> Show again
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
