import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { selectPublicTrees } from '../../lib/treeColumns.js';
import TreeDatabase from '../../components/TreeDatabase.jsx';
import { lguLabelOfTree } from '../../lib/treeRows.js';

/** Only what the list needs of a tree: its species, and its barangay's code for its LGU. */
const COLUMNS = 'id,species,scientific_name,barangay_psgc';

/**
 * The public Tree Database (22 October): every species tagged in Laguna, with
 * the write-up PGENRO keeps from DENR-ERDB's RISE publications — the same list
 * an office has on its Trees page, for the whole province, read-only. A
 * species comes on it when a tree of it is tagged anywhere in Laguna.
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
    <div className="bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="text-green-800">Tree </span>
          <span className="text-gray-900">Database</span>
        </h1>
        <p className="mt-3 max-w-3xl text-base text-gray-700">
          Every species of tree tagged in Laguna, with what DENR-ERDB&apos;s RISE publications say of it: what it looks
          like, where it grows, what it needs of a site, how it is grown and what it is used for. PGENRO keeps the
          write-ups; a species is listed here once a tree of it is tagged.
        </p>
        <div className="mt-8">
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
    </div>
  );
}
