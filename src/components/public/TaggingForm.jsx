import { useState, useEffect, useMemo, useRef } from 'react';
import { MapPin, Camera, Loader2, CheckCircle2, X } from 'lucide-react';
import Confetti from 'react-confetti';
import { supabase } from '../../supabaseClient.js';
import { municipalityAt } from '../../lib/lagunaBoundaries.js';
import { barangayAt, loadBarangayIndex } from '../../lib/barangayLookup.js';
import { barangaysOf, labelOf } from '../../lib/lguOptions.js';
import { useAuthIfAny } from '../../context/AuthContext.jsx';
import { displayNameOf, isProviderOff, signInWithGoogle, taggingAccess } from '../../lib/community.js';
import { SAME_TREE_RADIUS_M, treesNear } from '../../lib/nearbyTrees.js';

/** Postgres's "no such column", or PostgREST's cached form of it. */
const isMissingColumn = (error) =>
  error?.code === '42703' || error?.code === 'PGRST204' || /column .* does not exist|Could not find the/i.test(error?.message ?? '');

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUD_NAME';
const CLOUDINARY_UPLOAD_PRESET = 'tree_inventory_mobile';

const COMMON_SPECIES = [
  'Narra', 'Mahogany', 'Mango', 'Coconut', 'Acacia', 'Rambutan',
  'Santol', 'Fig Tree', 'Areca Palm', 'Sampaloc', 'Langka', 'Lanzones',
  'Bougainvillea', 'Kamagong', 'Molave', 'Ipil-Ipil', 'Gmelina',
  'Talisay', 'Banaba', 'Calamansi', 'Guava', 'Avocado', 'Durian',
];

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) return null;
  const data = await response.json();
  return data.secure_url;
}

/** Whose this tag is counted for: the resident who joined, by name. */
function CountedFor() {
  const auth = useAuthIfAny();
  if (taggingAccess(auth) !== 'resident') return null;
  return (
    <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-900 ring-1 ring-green-200">
      Counted for <span className="font-semibold">{displayNameOf(auth.resident)}</span> on the leaderboard once it is verified.
    </p>
  );
}

/**
 * Before the form: a tag needs a resident who has joined, or an office
 * (decided 19 October, so every tag is a real person's, for each city's City
 * Biodiversity Index). The database refuses one sent otherwise; this says so
 * first, and how.
 */
function TagGate({ access, onClose }) {
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState('');

  async function signIn() {
    setStarting(true);
    setProblem('');
    const { error } = await signInWithGoogle('/public-map');
    if (error) {
      setStarting(false);
      setProblem(isProviderOff(error) ? 'Signing in with Google is not switched on yet. Please try again soon.' : error.message);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="tag-gate-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        {access === 'checking' ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking whether you are signed in…
          </p>
        ) : (
          <>
            <h2 id="tag-gate-title" className="text-lg font-bold text-slate-900">
              {access === 'join' ? 'One step before you tag' : 'Sign in to tag a tree'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {access === 'join'
                ? 'Choose how you are shown on the leaderboard and agree to what is kept, and your tags will count.'
                : 'Each tag counts for the resident who sends it — on the leaderboard, and in your city’s City Biodiversity Index. Only your name or a nickname, your email (shown to nobody) and your tags are kept.'}
            </p>
            {problem && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              {access === 'join' ? (
                <a href="/community" className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800">Finish joining</a>
              ) : (
                <button type="button" onClick={signIn} disabled={starting}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50">
                  {starting && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                  Continue with Google
                </button>
              )}
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
                Not now
              </button>
            </div>
            {access !== 'join' && (
              <a href="/community" className="mt-3 inline-block text-xs font-semibold text-green-800 underline">What is kept, and the leaderboard</a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 *   nearbyTrees  the trees already on the map — verified, and tagged but not
 *                yet verified — so a tree a few metres away is asked about
 *                before it is tagged twice (19 October)
 */
export default function TaggingForm({ onClose, onSuccess, initialPosition, nearbyTrees = [] }) {
  const auth = useAuthIfAny();
  const [latitude, setLatitude] = useState(initialPosition ? initialPosition[0].toFixed(6) : '');
  const [longitude, setLongitude] = useState(initialPosition ? initialPosition[1].toFixed(6) : '');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [barangay, setBarangay] = useState('');
  const [barangayLoading, setBarangayLoading] = useState(false);
  const [species, setSpecies] = useState('');
  const [customSpecies, setCustomSpecies] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [leavesFile, setLeavesFile] = useState(null);
  const [barkFile, setBarkFile] = useState(null);
  const [fruitsFile, setFruitsFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const formRef = useRef(null);

  // Get window size for confetti
  useEffect(() => {
    function updateSize() {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Auto-get GPS on mount (only if no initial position provided)
  useEffect(() => {
    if (!initialPosition) {
      getGPS();
    }
  }, []);

  // Which town and barangay the tag is in, worked out from the PSA boundaries
  // the rest of the site uses — not asked of OpenStreetMap, whose crowdsourced
  // names ("Villa Silangan Subdivision", "Unknown Barangay") are what the
  // barangay clean-up had to undo. The town is what routes the tag to the
  // LGU that will verify it.
  const [municipality, setMunicipality] = useState('');
  useEffect(() => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    let cancelled = false;

    const town = municipalityAt([lat, lng]) ?? '';
    setMunicipality(town);
    if (!town) {
      setBarangay('');
      return undefined;
    }

    setBarangayLoading(true);
    loadBarangayIndex()
      .then(() => {
        if (cancelled) return;
        const found = barangayAt([lat, lng]);
        setBarangay(found?.municipality === town ? found.barangay : '');
      })
      .catch(() => {
        // The resident can still pick from the list.
      })
      .finally(() => {
        if (!cancelled) setBarangayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  const barangayOptions = barangaysOf(municipality);

  function getGPS() {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // A tree already tagged within a few metres: is this it?
  const [differentTree, setDifferentTree] = useState(false);
  const near = useMemo(
    () => treesNear([parseFloat(latitude), parseFloat(longitude)], nearbyTrees),
    [latitude, longitude, nearbyTrees]
  );
  useEffect(() => setDifferentTree(false), [latitude, longitude]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (near.length > 0 && !differentTree) {
      setSubmitError('A tree is already tagged here. Tick that this is a different tree, or close this if it is the same one.');
      return;
    }
    if (!latitude || !longitude) {
      setSubmitError('GPS coordinates are required. Please enable location services.');
      return;
    }
    if (!municipality) {
      setSubmitError('This spot is outside Laguna, so there is no LGU to send the tag to.');
      return;
    }
    if (!barangay) {
      setSubmitError('Please select a barangay.');
      return;
    }
    const finalSpecies = species === 'Others' ? customSpecies : species;
    if (!finalSpecies) {
      setSubmitError('Please select or enter a species name.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      // Upload images to Cloudinary
      const [photoUrl, leavesUrl, barkUrl, fruitsUrl] = await Promise.all([
        photoFile ? uploadToCloudinary(photoFile) : Promise.resolve(null),
        leavesFile ? uploadToCloudinary(leavesFile) : Promise.resolve(null),
        barkFile ? uploadToCloudinary(barkFile) : Promise.resolve(null),
        fruitsFile ? uploadToCloudinary(fruitsFile) : Promise.resolve(null),
      ]);

      // Insert into pending_trees
      const tag = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        barangay,
        species: finalSpecies,
        photo_url: photoUrl,
        leaves_url: leavesUrl,
        bark_url: barkUrl,
        fruits_url: fruitsUrl,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      };
      // Which city or municipality the resident was standing in. It is what
      // routes the tag to the LGU whose field team will verify it (see
      // supabase/tag_routing.sql); outside Laguna there is none, and PGENRO
      // gets it.

      let { error } = await supabase
        .from('pending_trees')
        .insert(municipality ? { ...tag, municipality } : tag);
      // A database that has not had tag_routing.sql run yet has no such
      // column. A resident's tag matters more than its routing: send it
      // without, and the database routes it by barangay once the file runs.
      if (error && isMissingColumn(error)) {
        ({ error } = await supabase.from('pending_trees').insert(tag));
      }

      if (error) throw error;
      setSuccess(true);
      // Auto-redirect after 4 seconds
      setTimeout(() => {
        onSuccess?.();
      }, 4000);
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Not signed in, or not yet joined: the gate, not the form.
  const access = taggingAccess(auth);
  if (access === 'checking' || access === 'sign-in' || access === 'join') {
    return <TagGate access={access} onClose={onClose} />;
  }

  // Success screen with confetti
  if (success) {
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={300}
          colors={['#16a34a', '#22c55e', '#84cc16', '#eab308', '#06b6d4']}
        />
        <div className="bg-white rounded-2xl p-8 mx-4 max-w-sm w-full text-center shadow-2xl relative z-10">
          <CheckCircle2 className="mx-auto text-green-600 mb-4" size={56} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Maraming Salamat!</h2>
          <p className="text-gray-600 mb-4">
            Thank you for your contribution! Our MENRO Arborists will verify your submission shortly.
          </p>
          <p className="text-sm text-gray-400">Redirecting back to the map…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div
        ref={formRef}
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-4 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-green-700 text-white px-5 py-4 rounded-t-2xl flex items-center justify-between z-10">
          <h2 className="text-lg font-bold">Tag a Tree</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-green-600 rounded-full transition"
            aria-label="Close form"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* GPS Coordinates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <MapPin size={14} className="inline mr-1" />
              GPS Coordinates
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={latitude}
                readOnly
                placeholder="Latitude"
                className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-xs bg-gray-50 truncate"
              />
              <input
                type="text"
                value={longitude}
                readOnly
                placeholder="Longitude"
                className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-xs bg-gray-50 truncate"
              />
            </div>
            {gpsLoading && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Getting your location…
              </p>
            )}
            {gpsError && (
              <p className="text-xs text-red-500 mt-1">{gpsError}</p>
            )}
            {!gpsLoading && !latitude && (
              <button
                type="button"
                onClick={getGPS}
                className="text-xs text-green-700 underline mt-1"
              >
                Retry GPS
              </button>
            )}
          </div>

          {/* Barangay */}
          <div>
            <label htmlFor="tag-barangay" className="block text-sm font-medium text-gray-700 mb-1">
              Barangay{municipality && <span className="font-normal text-gray-500">, {labelOf(municipality)}</span>}
              {barangayLoading && (
                <span className="ml-2 text-xs text-green-600 font-normal">
                  <Loader2 size={10} className="inline animate-spin mr-1" />
                  Detecting…
                </span>
              )}
            </label>
            <select
              id="tag-barangay"
              value={barangay}
              onChange={(e) => setBarangay(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
            >
              <option value="">{municipality ? 'Select barangay…' : 'Outside Laguna'}</option>
              {barangayOptions.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            {barangay && !barangayLoading && (
              <p className="text-[11px] text-green-600 mt-1">Worked out from where you are standing</p>
            )}
          </div>

          {/* Species */}
          <div>
            <label htmlFor="tag-species" className="block text-sm font-medium text-gray-700 mb-1">
              Species
            </label>
            <select
              id="tag-species"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
            >
              <option value="">Select species…</option>
              {COMMON_SPECIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="Others">Others (specify below)</option>
              <option value="Unknown">Unknown</option>
            </select>
            {species === 'Others' && (
              <input
                type="text"
                value={customSpecies}
                onChange={(e) => setCustomSpecies(e.target.value)}
                placeholder="Enter species name…"
                className="w-full mt-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
              />
            )}
          </div>

          {/* Photo Uploads */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              <Camera size={14} className="inline mr-1" />
              Photos
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FileUploadSlot
                label="Full Tree"
                file={photoFile}
                onFileChange={setPhotoFile}
                required
              />
              <FileUploadSlot
                label="Leaves"
                file={leavesFile}
                onFileChange={setLeavesFile}
              />
              <FileUploadSlot
                label="Bark"
                file={barkFile}
                onFileChange={setBarkFile}
              />
              <FileUploadSlot
                label="Fruits"
                file={fruitsFile}
                onFileChange={setFruitsFile}
              />
            </div>
          </div>

          {/* Error */}
          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          {near.length > 0 && (
            <div role="alert" className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              <p>
                <strong>Already tagged here?</strong>{' '}
                {near.length === 1 ? 'A tree is' : `${near.length} trees are`} on the map within {SAME_TREE_RADIUS_M} m of this spot:
              </p>
              <ul className="list-disc pl-5 text-xs">
                {near.slice(0, 3).map(({ tree, metres }) => (
                  <li key={tree.id}>
                    {tree.species || 'Unidentified'}, {Math.round(metres)} m away
                    {tree.__pending ? ' (tagged, not yet verified)' : ''}
                  </li>
                ))}
              </ul>
              <p className="text-xs">If it is the same tree, there is no need to tag it again.</p>
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={differentTree} onChange={(event) => setDifferentTree(event.target.checked)} />
                This is a different tree
              </label>
            </div>
          )}

          <CountedFor />

          <p className="text-xs text-slate-500">
            By sending a tag you agree to the <a href="/terms.html" target="_blank" rel="noreferrer" className="font-semibold text-green-800 underline">Terms of Use</a>: a tree you have seen, with your own
            photos, checked by a field officer before it is shown.
          </p>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-700 text-white font-semibold py-3 rounded-lg hover:bg-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit Tree Tag'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Small file upload slot component */
function FileUploadSlot({ label, file, onFileChange, required }) {
  const inputRef = useRef(null);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:border-green-400 hover:bg-green-50/50 transition"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileChange(f);
        }}
      />
      {file ? (
        <div className="space-y-1">
          <img
            src={URL.createObjectURL(file)}
            alt={label}
            className="w-full h-16 object-cover rounded"
          />
          <p className="text-[10px] text-gray-500 truncate">{file.name}</p>
        </div>
      ) : (
        <div>
          <Camera size={20} className="mx-auto text-gray-400 mb-1" />
          <p className="text-xs text-gray-500">{label}{required ? ' *' : ''}</p>
        </div>
      )}
    </div>
  );
}
