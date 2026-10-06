import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, LayersControl } from 'react-leaflet';
import { Upload, X, Loader2, CheckCircle, AlertTriangle, MapPin } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import CertificatePrint from './CertificatePrint.jsx';

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUD_NAME';
const CLOUDINARY_UPLOAD_PRESET = 'tree_inventory_mobile';

const MAP_CENTER = [14.2623, 121.3976];
const PH_MOBILE_DIGITS = 11;
const ZONE_TYPES = ['Residential', 'Commercial', 'Industrial', 'Institutional'];

function LocationPicker({ onLocationSelect, canSelect }) {
  useMapEvents({
    click(e) {
      if (canSelect) {
        onLocationSelect(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export default function WalkInPermitForm() {
  // Part 1 State
  const [clientName, setClientName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState('');
  const [brgyClearanceFile, setBrgyClearanceFile] = useState(null);
  const [photoFiles, setPhotoFiles] = useState([]);
  
  // Part 2 State
  const [zoneType, setZoneType] = useState('');
  const [numberOfTrees, setNumberOfTrees] = useState('');

  // Part 3 State
  const [trees, setTrees] = useState([]);
  const [selectedTrees, setSelectedTrees] = useState([]); // { id?, lat, lng, species, isTagged, photo_url, common_name, dbh, height, barangay }
  const [highlightedTreeId, setHighlightedTreeId] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);

  // Other State
  const [submitting, setSubmitting] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [submitError, setSubmitError] = useState('');

  const brgyInputRef = useRef(null);
  const photosInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrees() {
      const { data, error } = await supabase.from('trees').select('*');
      if (cancelled || error) return;
      setTrees(Array.isArray(data) ? data : []);
    }
    fetchTrees();
    return () => { cancelled = true; };
  }, []);

  const isPart1Complete = clientName.trim() !== '' && 
                          contactInfo.length === PH_MOBILE_DIGITS && 
                          address.trim() !== '' && 
                          reason.trim() !== '' &&
                          brgyClearanceFile !== null &&
                          photoFiles.length > 0;

  const isExempted = zoneType === 'Residential' && Number(numberOfTrees) > 0 && Number(numberOfTrees) <= 2;
  const isPart2Complete = isPart1Complete && zoneType !== '' && Number(numberOfTrees) > 0 && !isExempted;

  const handleContactChange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, PH_MOBILE_DIGITS);
    setContactInfo(digitsOnly);
  };

  const handleMapClick = (lat, lng) => {
    if (selectedTrees.length < Number(numberOfTrees)) {
      const newId = Date.now();
      setSelectedTrees(prev => [...prev, {
        lat, lng, isTagged: false, species: '', id: newId
      }]);
      setHighlightedTreeId(newId);
    }
  };

  const selectTaggedTree = (tree) => {
    if (selectedTrees.length < Number(numberOfTrees) && !selectedTrees.find(t => t.id === tree.id)) {
      setSelectedTrees(prev => [...prev, {
        id: tree.id,
        lat: tree.latitude,
        lng: tree.longitude,
        isTagged: true,
        species: tree.species || '',
        photo_url: tree.photo_url,
        common_name: tree.species,
        dbh: tree.dbh,
        height: tree.merchantable_height,
        barangay: tree.barangay
      }]);
      setHighlightedTreeId(tree.id);
    }
  };

  const updateSelectedTree = (id, field, value) => {
    setSelectedTrees(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const removeSelectedTree = (id) => {
    setSelectedTrees(prev => prev.filter(t => t.id !== id));
  };

  const focusTreeOnMap = (tree) => {
    setHighlightedTreeId(tree.id);
    if (mapInstance) {
      mapInstance.flyTo([tree.lat, tree.lng], 18, { duration: 0.5 });
    }
  };

  async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
      if (!res.ok) return null;
      const data = await res.json();
      return data.secure_url;
    } catch {
      return null;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isPart2Complete) return;
    if (selectedTrees.length !== Number(numberOfTrees)) {
      setSubmitError(`Please select ${numberOfTrees} trees on the map.`);
      return;
    }
    const incompleteCards = selectedTrees.some(t => !t.species.trim());
    if (incompleteCards) {
      setSubmitError('Please fill in the species for all selected trees.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const brgyUrl = await uploadToCloudinary(brgyClearanceFile);
      const photoUrls = (await Promise.all(photoFiles.map(f => uploadToCloudinary(f)))).filter(Boolean);
      const allUrls = [brgyUrl, ...photoUrls].filter(Boolean);

      const permitInserts = selectedTrees.map(t => ({
        tree_id: t.isTagged ? t.id : null,
        client_name: clientName,
        contact_info: contactInfo,
        reason: `${reason} - Zone: ${zoneType}`,
        requirements_urls: allUrls,
        species: t.species,
        number_of_trees: 1,
        address,
        latitude: t.lat,
        longitude: t.lng,
      }));

      await supabase.from('permits').insert(permitInserts);

      setPrintData({
        trees: selectedTrees,
        clientName,
        contactInfo,
        reason,
        numberOfTrees,
        zoneType
      });

      setTimeout(() => {
        window.print();
        setPrintData(null);
        setClientName(''); setContactInfo(''); setAddress(''); setReason('');
        setBrgyClearanceFile(null); setPhotoFiles([]);
        setZoneType(''); setNumberOfTrees('');
        setSelectedTrees([]);
        setSubmitting(false);
      }, 300);
    } catch (err) {
      setSubmitError('Submission failed. Please try again.');
      setSubmitting(false);
    }
  }

  const baseInput = "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-green-500 focus:ring-green-500/20";
  const disabledInput = "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-slate-100 text-slate-400 cursor-not-allowed";

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Part 1: Client Details & Requirements */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative overflow-hidden transition-all duration-500">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs">1</span>
            Client Details &amp; Requirements
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Client Full Name</label>
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className={baseInput} placeholder="e.g. Juan Dela Cruz" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contact Number</label>
                <input type="tel" value={contactInfo} onChange={handleContactChange} className={baseInput} placeholder="09171234567" maxLength={PH_MOBILE_DIGITS} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Complete Address</label>
                <textarea value={address} onChange={e => setAddress(e.target.value)} className={`${baseInput} resize-none`} rows={2} placeholder="House No, Street, Barangay..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason for Cutting</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} className={`${baseInput} resize-none`} rows={2} placeholder="Describe reason..." />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Barangay Clearance</label>
                <div 
                  onClick={() => brgyInputRef.current?.click()}
                  className={`border-2 rounded-lg p-5 text-center cursor-pointer transition-colors ${brgyClearanceFile ? 'border-green-500 border-solid bg-green-50' : 'border-dashed border-gray-300 bg-gray-50 hover:border-gray-400'}`}
                >
                  {brgyClearanceFile ? (
                    <div className="flex flex-col items-center">
                      <CheckCircle className="text-green-500 mb-1" size={24} />
                      <p className="text-xs font-medium text-green-700">{brgyClearanceFile.name}</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="mx-auto text-slate-400 mb-1" size={24} />
                      <p className="text-xs font-medium text-slate-600">Upload Barangay Clearance</p>
                    </>
                  )}
                  <input ref={brgyInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
                    if (e.target.files?.[0]) setBrgyClearanceFile(e.target.files[0]);
                  }} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Photos of Trees</label>
                <div 
                  onClick={() => photosInputRef.current?.click()}
                  className={`border-2 rounded-lg p-5 text-center cursor-pointer transition-colors ${photoFiles.length > 0 ? 'border-green-500 border-solid bg-green-50' : 'border-dashed border-gray-300 bg-gray-50 hover:border-gray-400'}`}
                >
                  {photoFiles.length > 0 ? (
                    <div className="flex flex-col items-center">
                      <CheckCircle className="text-green-500 mb-1" size={24} />
                      <p className="text-xs font-medium text-green-700">{photoFiles.length} Photo{photoFiles.length > 1 ? 's' : ''} uploaded</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="mx-auto text-slate-400 mb-1" size={24} />
                      <p className="text-xs font-medium text-slate-600">Upload Tree Photos</p>
                    </>
                  )}
                  <input ref={photosInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => {
                    if (e.target.files?.length) setPhotoFiles(Array.from(e.target.files));
                  }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Part 2: Zone & Tree Quota */}
        <section className="relative rounded-xl overflow-hidden">
          {!isPart1Complete && (
            <div className="absolute inset-0 bg-slate-100/70 backdrop-blur-[1px] z-10 flex items-center justify-center transition-all duration-500 ease-in-out">
              <p className="text-slate-500 font-medium text-sm flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm">
                Complete Part 1 to unlock
              </p>
            </div>
          )}
          <div className="bg-white border border-slate-200 shadow-sm p-6 relative">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs transition-colors ${isPart1Complete ? 'bg-slate-900' : 'bg-slate-400'}`}>2</span>
              Zone &amp; Tree Quota
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Zone Type</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ZONE_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      disabled={!isPart1Complete}
                      onClick={() => setZoneType(type)}
                      className={`py-4 px-2 rounded-xl border-2 font-semibold text-sm transition-colors text-center
                        ${zoneType === type ? 'border-slate-900 bg-slate-900 text-white shadow-md' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}
                        ${!isPart1Complete ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Number of Trees</label>
                <input 
                  type="number" 
                  min="1" 
                  value={numberOfTrees} 
                  onChange={e => setNumberOfTrees(e.target.value)}
                  disabled={!zoneType}
                  className={zoneType ? baseInput : disabledInput} 
                  placeholder="0"
                />
              </div>

              {isExempted && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-amber-800">
                  <AlertTriangle className="shrink-0 text-amber-500" size={20} />
                  <div className="text-sm leading-relaxed">
                    <strong>Exempted from Permit.</strong> Based on current DENR Administrative Order No. 6-2026, Section 4, No permit shall be required for the cutting, gathering, collecting and/or removing of not more than two (2) trees within a residential lot.{' '}
                    <a href="https://databank.denr.gov.ph/views/data/index.php?action=view&id=65987&type=35" target="_blank" rel="noreferrer" className="underline font-semibold hover:text-amber-900">
                      Click here for the DAO.
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Part 3: Map & Selection */}
        <section className="relative rounded-xl overflow-hidden">
          {!isPart2Complete && (
            <div className="absolute inset-0 bg-slate-100/70 backdrop-blur-[1px] z-10 flex items-center justify-center transition-all duration-500 ease-in-out">
              <p className="text-slate-500 font-medium text-sm flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm">
                {isExempted ? "Permit is exempted for this quota." : "Select Zone & Quota to unlock Map"}
              </p>
            </div>
          )}
          
          <div className="bg-white border border-slate-200 shadow-sm p-6 relative">
             <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs transition-colors ${isPart2Complete ? 'bg-slate-900' : 'bg-slate-400'}`}>3</span>
                 Map &amp; Tree Selection
               </div>
               {isPart2Complete && (
                 <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                   Selected: {selectedTrees.length} / {numberOfTrees}
                 </span>
               )}
            </h2>

            <div className="h-[400px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner relative z-0">
              <MapContainer center={MAP_CENTER} zoom={16} className="h-full w-full" ref={setMapInstance}>
                <LayersControl position="topright">
                  <LayersControl.BaseLayer checked name="Street View">
                    <TileLayer
                      attribution='&copy; OpenStreetMap'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Copernicus Satellite View">
                    <TileLayer
                      attribution='Tiles &copy; Esri'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                  </LayersControl.BaseLayer>
                </LayersControl>
                
                <LocationPicker onLocationSelect={handleMapClick} canSelect={selectedTrees.length < Number(numberOfTrees)} />
                
                {trees.map(tree => {
                  const isAlreadySelected = selectedTrees.find(t => t.id === tree.id);
                  return (
                    <Marker 
                      key={tree.id} 
                      position={[tree.latitude, tree.longitude]}
                      eventHandlers={{
                        click: () => setHighlightedTreeId(tree.id),
                      }}
                    >
                      <Popup className="custom-popup">
                        <div className="p-1 w-48">
                           {tree.photo_url ? (
                             <img src={tree.photo_url} alt={tree.species} className="w-full h-24 object-cover rounded-md mb-2" />
                           ) : (
                             <div className="w-full h-24 bg-slate-100 flex items-center justify-center rounded-md mb-2 text-xs text-slate-400">No Photo</div>
                           )}
                           <h4 className="font-bold text-sm text-slate-800 leading-tight">{tree.species || 'Unknown'}</h4>
                           {tree.barangay && (
                             <p className="text-[10px] text-slate-500 font-medium leading-tight mb-2">{tree.barangay}</p>
                           )}
                           <div className="text-xs text-slate-600 mt-1 flex flex-col gap-0.5">
                             <div className="flex justify-between"><span>DBH:</span> <span>{tree.dbh ? `${tree.dbh} cm` : '--'}</span></div>
                             <div className="flex justify-between"><span>Height:</span> <span>{tree.merchantable_height ? `${tree.merchantable_height} m` : '--'}</span></div>
                           </div>
                           {!isAlreadySelected ? (
                             <button 
                               onClick={(e) => { e.stopPropagation(); selectTaggedTree(tree); }}
                               className="mt-3 w-full bg-slate-800 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-slate-900"
                             >
                               Select this Tree
                             </button>
                           ) : (
                             <div className="mt-3 w-full bg-green-50 text-green-700 border border-green-200 rounded-lg py-1.5 text-xs font-semibold text-center">
                               Selected
                             </div>
                           )}
                        </div>
                      </Popup>
                    </Marker>
                  )
                })}

                {selectedTrees.filter(t => !t.isTagged).map(t => (
                  <Marker 
                    key={t.id} 
                    position={[t.lat, t.lng]} 
                    eventHandlers={{ click: () => setHighlightedTreeId(t.id) }} 
                  />
                ))}
              </MapContainer>
            </div>

            {selectedTrees.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Selected Trees Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedTrees.map((tree, i) => (
                    <div 
                      key={tree.id} 
                      onClick={() => focusTreeOnMap(tree)}
                      onFocus={() => focusTreeOnMap(tree)}
                      className={`border rounded-xl p-4 relative transition-all duration-300 cursor-pointer ${highlightedTreeId === tree.id ? 'border-green-500 bg-green-50 shadow-md ring-2 ring-green-500/20' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                    >
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeSelectedTree(tree.id); }}
                        className="absolute top-3 right-3 text-slate-400 hover:text-red-500 z-10 p-1"
                      >
                        <X size={16} />
                      </button>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-white border border-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 shadow-sm">
                          {i + 1}
                        </div>
                        <span className="text-xs font-semibold text-slate-700">
                          {tree.isTagged ? 'Tagged Tree' : 'New Pin'}
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Species</label>
                          {tree.isTagged ? (
                            <div className="font-medium text-sm text-slate-900 bg-white border border-slate-200 rounded px-2 py-1.5 shadow-sm">{tree.species || 'Unknown'}</div>
                          ) : (
                            <input 
                              type="text" 
                              value={tree.species}
                              onChange={e => updateSelectedTree(tree.id, 'species', e.target.value)}
                              className="w-full text-sm border-slate-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500 shadow-sm"
                              placeholder="e.g. Mahogany"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle size={18} />
            {submitError}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={submitting || !isPart2Complete || selectedTrees.length === 0}
            className="px-8 py-3 rounded-xl bg-green-600 text-base font-bold text-white hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            {submitting ? 'Processing...' : 'Submit & Print Certificate'}
          </button>
        </div>
      </form>

      {printData && (
        <CertificatePrint
          walkInData={{
            clientName: printData.clientName,
            address: address,
            numberOfTrees: printData.numberOfTrees,
            species: printData.trees.map(t => t.species).join(', '),
            latitude: printData.trees[0]?.lat,
            longitude: printData.trees[0]?.lng,
          }}
        />
      )}
    </>
  );
}
