import { useState, useEffect, useRef } from 'react';
import { MapPin, Camera, Loader2, CheckCircle2, X } from 'lucide-react';
import Confetti from 'react-confetti';
import { supabase } from '../../supabaseClient.js';

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUD_NAME';
const CLOUDINARY_UPLOAD_PRESET = 'tree_inventory_mobile';

const BARANGAYS = [
  'Alipit', 'Bagumbayan', 'Barangay I', 'Barangay II', 'Barangay III',
  'Barangay IV', 'Barangay V', 'Bubukal', 'Calios', 'Duhat', 'Gatid',
  'Jasaan', 'Labuin', 'Malinao', 'Oogong', 'Pagsawitan', 'Palasan',
  'Patimbao', 'San Jose', 'San Juan', 'San Pablo Norte', 'San Pablo Sur',
  'Santisima Cruz', 'Santo Angel Central', 'Santo Angel Norte', 'Santo Angel Sur',
];

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

export default function TaggingForm({ onClose, onSuccess, initialPosition }) {
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

  // Auto-detect barangay from coordinates via reverse geocoding
  useEffect(() => {
    if (!latitude || !longitude) return;
    let cancelled = false;

    async function detectBarangay() {
      setBarangayLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (cancelled) return;
        if (!res.ok) throw new Error('Geocoding failed');
        const data = await res.json();
        const addr = data?.address || {};
        // Nominatim may return the barangay under different keys
        const detected = addr.suburb || addr.neighbourhood || addr.village || addr.quarter || '';

        if (detected) {
          // Try to match against our known barangays list
          const match = BARANGAYS.find(
            (b) => b.toLowerCase() === detected.toLowerCase() ||
                   detected.toLowerCase().includes(b.toLowerCase()) ||
                   b.toLowerCase().includes(detected.toLowerCase())
          );
          if (match) {
            setBarangay(match);
          } else {
            // Partial match — set the closest or leave for user to pick
            setBarangay('');
          }
        }
      } catch {
        // Silently fail — user can still pick manually
      } finally {
        if (!cancelled) setBarangayLoading(false);
      }
    }

    detectBarangay();
    return () => { cancelled = true; };
  }, [latitude, longitude]);

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!latitude || !longitude) {
      setSubmitError('GPS coordinates are required. Please enable location services.');
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
      const { error } = await supabase.from('pending_trees').insert({
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
      });

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
              Barangay
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
              <option value="">Select barangay…</option>
              {BARANGAYS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            {barangay && !barangayLoading && (
              <p className="text-[11px] text-green-600 mt-1">Auto-detected from your location</p>
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
