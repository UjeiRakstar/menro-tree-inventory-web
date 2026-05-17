import { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import CertificatePrint from './CertificatePrint.jsx';

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUD_NAME';
const CLOUDINARY_UPLOAD_PRESET = 'tree_inventory_mobile';

const MAP_CENTER = [14.2623, 121.3976];

const OTHER_SPECIES_VALUE = '__other__';

// Fallback list used when the trees table has no species yet — keeps the
// dropdown usable on a brand-new install.
const FALLBACK_SPECIES = [
  { common: 'Narra', scientific: 'Pterocarpus indicus' },
  { common: 'Mahogany', scientific: 'Swietenia macrophylla' },
  { common: 'Mango', scientific: 'Mangifera indica' },
  { common: 'Coconut', scientific: 'Cocos nucifera' },
  { common: 'Acacia', scientific: 'Samanea saman' },
];

const PH_MOBILE_DIGITS = 11;

function LocationPicker({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function WalkInPermitForm() {
  const [species, setSpecies] = useState('');
  const [otherSpecies, setOtherSpecies] = useState('');
  const [numberOfTrees, setNumberOfTrees] = useState(1);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [clientName, setClientName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [speciesFromDb, setSpeciesFromDb] = useState([]);
  const fileInputRef = useRef(null);

  // Fetch distinct species names from the trees table once on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchSpecies() {
      const { data, error } = await supabase.from('trees').select('species, scientific_name');
      if (cancelled || error || !Array.isArray(data)) return;
      // Build unique-by-common-name list, preserving any scientific_name we find
      const seen = new Map();
      data.forEach((row) => {
        const common = (row?.species || '').trim();
        if (!common) return;
        if (!seen.has(common)) {
          seen.set(common, {
            common,
            scientific: (row?.scientific_name || '').trim(),
          });
        } else if (!seen.get(common).scientific && row?.scientific_name) {
          seen.set(common, {
            common,
            scientific: String(row.scientific_name).trim(),
          });
        }
      });
      setSpeciesFromDb(
        Array.from(seen.values()).sort((a, b) => a.common.localeCompare(b.common)),
      );
    }
    fetchSpecies();
    return () => { cancelled = true; };
  }, []);

  // Use DB-sourced species when available, otherwise the fallback list
  const speciesOptions = useMemo(
    () => (speciesFromDb.length > 0 ? speciesFromDb : FALLBACK_SPECIES),
    [speciesFromDb],
  );

  const isOtherSelected = species === OTHER_SPECIES_VALUE;

  function handleMapClick(lat, lng) {
    setLatitude(lat);
    setLongitude(lng);
    setErrors((prev) => ({ ...prev, location: undefined }));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  /** Strip non-digits and clamp to 11 characters. */
  function handleContactChange(e) {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, PH_MOBILE_DIGITS);
    setContactInfo(digitsOnly);
    setErrors((prev) => ({ ...prev, contactInfo: undefined }));
  }

  /** Validate every field and return a map of errors. Empty map = valid. */
  function validate() {
    const next = {};
    if (!species) next.species = 'Please select a species.';
    if (isOtherSelected && !otherSpecies.trim()) {
      next.otherSpecies = 'Please specify the species name.';
    }
    if (!Number.isFinite(numberOfTrees) || numberOfTrees < 1) {
      next.numberOfTrees = 'Number of trees must be at least 1.';
    }
    if (!address.trim()) next.address = 'Complete address is required.';
    if (latitude == null || longitude == null) {
      next.location = 'Pin a location on the map.';
    }
    if (!clientName.trim()) next.clientName = 'Client name is required.';
    if (!contactInfo) {
      next.contactInfo = 'Contact number is required.';
    } else if (!/^\d+$/.test(contactInfo)) {
      next.contactInfo = 'Contact number must contain digits only.';
    } else if (contactInfo.length !== PH_MOBILE_DIGITS) {
      next.contactInfo = `Contact number must be ${PH_MOBILE_DIGITS} digits (e.g. 09171234567).`;
    }
    if (!reason.trim()) next.reason = 'Reason for cutting is required.';
    return next;
  }

  async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
    if (!res.ok) return null;
    const data = await res.json();
    return data.secure_url;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    const fieldErrors = validate();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      setSubmitError('Please fix the highlighted fields and try again.');
      return;
    }

    setSubmitting(true);
    const speciesCommonName = isOtherSelected ? otherSpecies.trim() : species;
    const speciesScientific = isOtherSelected
      ? ''
      : speciesOptions.find((s) => s.common === species)?.scientific || '';

    try {
      let uploadedUrls = [];
      if (files.length > 0) {
        const results = await Promise.all(files.map((f) => uploadToCloudinary(f)));
        uploadedUrls = results.filter(Boolean);
      }

      await supabase.from('permits').insert({
        tree_id: null,
        client_name: clientName,
        contact_info: contactInfo,
        reason,
        requirements_urls: uploadedUrls,
        species: speciesCommonName,
        number_of_trees: numberOfTrees,
        address,
        latitude,
        longitude,
      });

      setPrintData({
        tree: {
          species: speciesCommonName,
          scientific_name: speciesScientific,
          latitude,
          longitude,
          barangay: address,
          merchantable_height: 'N/A',
        },
        clientName,
        contactInfo,
        reason,
        numberOfTrees,
      });

      setTimeout(() => {
        window.print();
        setPrintData(null);
        // Reset form
        setSpecies('');
        setOtherSpecies('');
        setNumberOfTrees(1);
        setAddress('');
        setLatitude(null);
        setLongitude(null);
        setClientName('');
        setContactInfo('');
        setReason('');
        setFiles([]);
        setErrors({});
        setSubmitting(false);
      }, 300);
    } catch (err) {
      console.error('Walk-in submission error:', err);
      setSubmitError(err?.message || 'Submission failed. Please try again.');
      setSubmitting(false);
    }
  }

  // Tailwind class helper to highlight fields with errors
  const fieldClass = (key, base) =>
    `${base} ${errors[key] ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'focus:border-green-500 focus:ring-green-500/20'}`;
  const baseInput =
    'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2';

  return (
    <>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
        {/* Top action bar — Submit lives here so it's always visible */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Walk-in Cutting Permit</h3>
            <p className="text-xs text-slate-500">Submit and print the cutting certificate when complete.</p>
          </div>
          <button type="submit" disabled={submitting}
            className="px-5 py-2.5 rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 transition disabled:opacity-50 inline-flex items-center gap-2 shadow-sm">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'Processing…' : 'Submit & Print Certificate'}
          </button>
        </div>

        {/* Inline submission summary */}
        {submitError && (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Column 1: Tree & Location */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Tree &amp; Location Details</h3>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Species</label>
              <select
                value={species}
                onChange={(e) => {
                  setSpecies(e.target.value);
                  setErrors((prev) => ({ ...prev, species: undefined }));
                }}
                className={fieldClass('species', `${baseInput} bg-white text-slate-900`)}
              >
                <option value="">Select species…</option>
                {speciesOptions.map((s) => (
                  <option key={s.common} value={s.common}>
                    {s.scientific ? `${s.common} (${s.scientific})` : s.common}
                  </option>
                ))}
                <option value={OTHER_SPECIES_VALUE}>Other (specify below)</option>
              </select>
              {errors.species && <p className="mt-1 text-xs text-red-600">{errors.species}</p>}
              {isOtherSelected && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={otherSpecies}
                    onChange={(e) => {
                      setOtherSpecies(e.target.value);
                      setErrors((prev) => ({ ...prev, otherSpecies: undefined }));
                    }}
                    placeholder="Enter species name (common or scientific)"
                    className={fieldClass('otherSpecies', baseInput)}
                  />
                  {errors.otherSpecies && (
                    <p className="mt-1 text-xs text-red-600">{errors.otherSpecies}</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Number of Trees</label>
              <input
                type="number"
                min="1"
                value={numberOfTrees}
                onChange={(e) => {
                  setNumberOfTrees(parseInt(e.target.value, 10) || 1);
                  setErrors((prev) => ({ ...prev, numberOfTrees: undefined }));
                }}
                className={fieldClass('numberOfTrees', baseInput)}
              />
              {errors.numberOfTrees && (
                <p className="mt-1 text-xs text-red-600">{errors.numberOfTrees}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Complete Address</label>
              <textarea
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setErrors((prev) => ({ ...prev, address: undefined }));
                }}
                rows={2}
                placeholder="Barangay, Street, Landmark…"
                className={fieldClass('address', `${baseInput} resize-none`)}
              />
              {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address}</p>}
            </div>

            {/* Mini Map */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Pin Location on Map
                {latitude != null && (
                  <span className="ml-2 text-green-600">
                    ({latitude.toFixed(5)}, {longitude.toFixed(5)})
                  </span>
                )}
              </label>
              <div className={`h-64 rounded-lg overflow-hidden border ${errors.location ? 'border-red-400' : 'border-slate-200'}`}>
                <MapContainer center={MAP_CENTER} zoom={16} className="h-full w-full">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OSM" />
                  <LocationPicker onLocationSelect={handleMapClick} />
                  {latitude != null && longitude != null && <Marker position={[latitude, longitude]} />}
                </MapContainer>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Click the map to drop a pin</p>
              {errors.location && <p className="mt-1 text-xs text-red-600">{errors.location}</p>}
            </div>
          </div>

          {/* Column 2: Client & Uploads */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Client Details &amp; Requirements</h3>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Client Name</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  setErrors((prev) => ({ ...prev, clientName: undefined }));
                }}
                placeholder="Full name of applicant"
                className={fieldClass('clientName', baseInput)}
              />
              {errors.clientName && <p className="mt-1 text-xs text-red-600">{errors.clientName}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Contact Number <span className="text-slate-400">(11-digit PH mobile)</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                pattern="\d*"
                maxLength={PH_MOBILE_DIGITS}
                value={contactInfo}
                onChange={handleContactChange}
                placeholder="09171234567"
                className={fieldClass('contactInfo', baseInput)}
                aria-invalid={errors.contactInfo ? 'true' : 'false'}
              />
              <div className="mt-1 flex items-center justify-between">
                {errors.contactInfo ? (
                  <p className="text-xs text-red-600">{errors.contactInfo}</p>
                ) : (
                  <span className="text-[10px] text-slate-400">Numbers only.</span>
                )}
                <span className={`text-[10px] ${contactInfo.length === PH_MOBILE_DIGITS ? 'text-green-600' : 'text-slate-400'}`}>
                  {contactInfo.length}/{PH_MOBILE_DIGITS}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reason for Cutting</label>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setErrors((prev) => ({ ...prev, reason: undefined }));
                }}
                rows={3}
                placeholder="Describe the reason…"
                className={fieldClass('reason', `${baseInput} resize-none`)}
              />
              {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason}</p>}
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition ${
                dragOver ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400'
              }`}
            >
              <Upload size={24} className="mx-auto text-slate-400 mb-1" />
              <p className="text-xs font-medium text-slate-600">Drag &amp; drop requirements</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Photos, Barangay Clearance, etc.</p>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf"
                onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files)])}
                className="hidden" />
            </div>

            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded px-3 py-1.5 text-xs">
                    <span className="text-slate-700 truncate">{file.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 ml-2">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Certificate Print */}
      {printData && (
        <CertificatePrint
          walkInData={{
            species: printData.tree.species,
            scientificName: printData.tree.scientific_name,
            address: printData.tree.barangay,
            latitude: printData.tree.latitude,
            longitude: printData.tree.longitude,
            clientName: printData.clientName,
            numberOfTrees: printData.numberOfTrees,
          }}
        />
      )}
    </>
  );
}
