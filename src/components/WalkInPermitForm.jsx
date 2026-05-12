import { useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { Upload, X, Loader2, MapPin } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import CertificatePrint from './CertificatePrint.jsx';

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUD_NAME';
const CLOUDINARY_UPLOAD_PRESET = 'tree_inventory_mobile';

const MAP_CENTER = [14.2623, 121.3976];

const SPECIES_OPTIONS = [
  { common: 'Narra', scientific: 'Pterocarpus indicus' },
  { common: 'Mahogany', scientific: 'Swietenia macrophylla' },
  { common: 'Mango', scientific: 'Mangifera indica' },
  { common: 'Coconut', scientific: 'Cocos nucifera' },
  { common: 'Acacia', scientific: 'Samanea saman' },
  { common: 'Gmelina', scientific: 'Gmelina arborea' },
  { common: 'Ipil-ipil', scientific: 'Leucaena leucocephala' },
  { common: 'Santol', scientific: 'Sandoricum koetjape' },
  { common: 'Jackfruit', scientific: 'Artocarpus heterophyllus' },
  { common: 'Rambutan', scientific: 'Nephelium lappaceum' },
];

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
  const fileInputRef = useRef(null);

  function handleMapClick(lat, lng) {
    setLatitude(lat);
    setLongitude(lng);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  }

  function removeFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index));
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
    if (!species || !clientName) return;
    setSubmitting(true);

    try {
      // Upload files
      let uploadedUrls = [];
      if (files.length > 0) {
        const results = await Promise.all(files.map(f => uploadToCloudinary(f)));
        uploadedUrls = results.filter(Boolean);
      }

      // Insert into permits table
      await supabase.from('permits').insert({
        tree_id: null,
        client_name: clientName,
        contact_info: contactInfo,
        reason,
        requirements_urls: uploadedUrls,
        species,
        number_of_trees: numberOfTrees,
        address,
        latitude,
        longitude,
      });

      // Get scientific name for certificate
      const selectedSpecies = SPECIES_OPTIONS.find(s => s.common === species);

      // Trigger print
      setPrintData({
        tree: {
          species,
          scientific_name: selectedSpecies?.scientific || '',
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
        setNumberOfTrees(1);
        setAddress('');
        setLatitude(null);
        setLongitude(null);
        setClientName('');
        setContactInfo('');
        setReason('');
        setFiles([]);
        setSubmitting(false);
      }, 300);
    } catch (err) {
      console.error('Walk-in submission error:', err);
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Column 1: Tree & Location */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Tree & Location Details</h3>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Species</label>
              <select value={species} onChange={(e) => setSpecies(e.target.value)} required
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20">
                <option value="">Select species…</option>
                {SPECIES_OPTIONS.map(s => (
                  <option key={s.common} value={s.common}>{s.common} ({s.scientific})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Number of Trees</label>
              <input type="number" min="1" value={numberOfTrees} onChange={(e) => setNumberOfTrees(parseInt(e.target.value) || 1)} required
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Complete Address</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Barangay, Street, Landmark…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none" />
            </div>

            {/* Mini Map */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Pin Location on Map
                {latitude && <span className="ml-2 text-green-600">({latitude.toFixed(5)}, {longitude.toFixed(5)})</span>}
              </label>
              <div className="h-64 rounded-lg overflow-hidden border border-slate-200">
                <MapContainer center={MAP_CENTER} zoom={16} className="h-full w-full">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OSM" />
                  <LocationPicker onLocationSelect={handleMapClick} />
                  {latitude && longitude && <Marker position={[latitude, longitude]} />}
                </MapContainer>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Click the map to drop a pin</p>
            </div>
          </div>

          {/* Column 2: Client & Uploads */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Client Details & Requirements</h3>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Client Name</label>
              <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="Full name of applicant"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contact Info</label>
              <input type="text" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="Phone or email"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reason for Cutting</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Describe the reason…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none" />
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
              <p className="text-xs font-medium text-slate-600">Drag & drop requirements</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Photos, Barangay Clearance, etc.</p>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" onChange={(e) => setFiles(prev => [...prev, ...Array.from(e.target.files)])} className="hidden" />
            </div>

            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded px-3 py-1.5 text-xs">
                    <span className="text-slate-700 truncate">{file.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 ml-2"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={submitting}
            className="px-5 py-2.5 rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 transition disabled:opacity-50 inline-flex items-center gap-2">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'Processing…' : 'Submit & Print Certificate'}
          </button>
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
