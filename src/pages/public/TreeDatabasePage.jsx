import { useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { selectPublicTrees } from '../../lib/treeColumns.js';
import TreeDatabase from '../../components/TreeDatabase.jsx';
import { lguLabelOfTree } from '../../lib/treeRows.js';
// Forested hills over a lake, from the air. Shrunk from src/assets/Aerial.jpg
// by tools/optimise-images.mjs.
import heroImg from '../../assets/optimised/aerial.avif';

/**
 * Only what the page needs of a tree: its species, its barangay's code for
 * its LGU, and its photos with their source — a resident's tag never
 * illustrates a species (treeDatabase.js).
 */
const COLUMNS = 'id,species,scientific_name,barangay_psgc,source,imageUrl,photo_url,leaves_url,bark_url,fruits_url';

/**
 * The public Tree Database (22 October): every species tagged in Laguna, with
 * the write-up PGENRO keeps from DENR-ERDB's RISE publications and the field
 * officers' photos of it — the same list an office has on its Trees page, for
 * the whole province, read-only. A species comes on it when a tree of it is
 * tagged anywhere in Laguna.
 */
export default function TreeDatabasePage() {
  const [trees, setTrees] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await selectPublicTrees(supabase, COLUMNS);
      if (cancelled) return;
      setFailed(Boolean(error));
      setTrees(!error && Array.isArray(data) ? data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="relative overflow-hidden bg-green-900" aria-label="Tree Database of Laguna">
        <img src={heroImg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-green-950/85" />
        <div className="relative mx-auto flex min-h-[20rem] max-w-6xl flex-col justify-end px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-widest text-lime-200">The trees of Laguna</p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            <BookOpen size={44} className="shrink-0 text-lime-300" aria-hidden="true" />
            <span className="min-w-0">Tree Database</span>
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-green-50 sm:text-lg">
            Every species of tree tagged in Laguna, with what DENR-ERDB&apos;s RISE publications say of it — what it looks
            like, where it grows, what it needs of a site, how it is grown and what it is used for — and the field
            officers&apos; photos of it. PGENRO keeps the write-ups; a species is listed here once a tree of it is tagged.
          </p>
        </div>
      </section>
      <div className="bg-white px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {trees === null ? (
            <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin text-green-700" aria-hidden="true" /> Loading the trees…
            </p>
          ) : failed ? (
            <p role="alert" className="text-sm text-red-700">The tagged trees could not be loaded. Try again in a moment.</p>
          ) : (
            <TreeDatabase trees={trees} place="Laguna" bare placeOf={lguLabelOfTree} placesLabel="Where it is tagged, by city and municipality" />
          )}
        </div>
      </div>
    </>
  );
}
