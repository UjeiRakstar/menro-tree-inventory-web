import { useState } from 'react';
import { X, TreePine, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import CertificatePrint from './CertificatePrint.jsx';
import RequirementsDrop from './RequirementsDrop.jsx';

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUD_NAME';
const CLOUDINARY_UPLOAD_PRESET = 'tree_inventory_mobile';

export default function IssuePermitModal({ isOpen, onClose, tree, onIssue }) {
  const [clientName, setClientName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [submitError, setSubmitError] = useState('');

  if (!isOpen || !tree) return null;

  function addFiles(added) {
    setFiles(prev => [...prev, ...added]);
  }

  function removeFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!response.ok) {
      console.error('Cloudinary upload failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data.secure_url;
  }

  async function handleSubmit() {
    // Validate all required fields
    if (!clientName.trim() || !contactInfo.trim() || !reason.trim()) {
      alert('Please fill in all required fields: Client Name, Contact Info, and Reason for Cutting.');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Upload files to Cloudinary
      let uploadedUrls = [];
      if (files.length > 0) {
        const uploadPromises = files.map(f => uploadToCloudinary(f));
        const results = await Promise.all(uploadPromises);
        uploadedUrls = results.filter(Boolean);
      }

      // 2. Insert into permits table — refused, nothing is printed
      setSubmitError('');
      const { error: insertError } = await supabase.from('permits').insert({
        tree_id: tree.id,
        client_name: clientName,
        contact_info: contactInfo,
        reason: reason,
        requirements_urls: uploadedUrls,
      });
      if (insertError) throw new Error(insertError.message);

      // 3. Update tree status
      await supabase.from('trees').update({ has_cutting_permit: true }).eq('id', tree.id);

      // 4. Notify parent
      onIssue(tree, { clientName, contactInfo, reason });

      // 5. Trigger print
      setPrintData({ tree, clientName, contactInfo, reason });

      // Wait for print component to mount, then print
      setTimeout(() => {
        window.print();
        // Clean up after print
        setPrintData(null);
        setClientName('');
        setContactInfo('');
        setReason('');
        setFiles([]);
        setSubmitting(false);
        onClose();
      }, 300);
    } catch (err) {
      console.error('Permit submission error:', err);
      setSubmitError(`The permit was not issued: ${err.message}`);
      setSubmitting(false);
    }
  }

  const photoUrl = tree.photo_url || tree.imageUrl;

  return (
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl max-w-4xl w-full mx-4 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Issue Cutting Permit</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body — Two columns */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Column 1: Tree Identity Card */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Tree Identity</h3>
              <div className="flex gap-4">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={tree.species}
                    className="w-24 h-24 object-cover rounded-md flex-shrink-0"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-24 h-24 rounded-md bg-slate-200 flex items-center justify-center flex-shrink-0">
                    <TreePine size={24} className="text-slate-400" />
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-slate-500">Species:</span>
                    <span className="ml-2 font-medium text-slate-800">{tree.species}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Tree ID:</span>
                    <span className="ml-2 font-medium text-slate-800">{tree.tree_id || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">DBH:</span>
                    <span className="ml-2 font-medium text-slate-800">{tree.dbh}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Coordinates:</span>
                    <span className="ml-2 font-medium text-slate-800">
                      {tree.latitude?.toFixed(5)}, {tree.longitude?.toFixed(5)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Citizen Input Form */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Permit Application Details</h3>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Client Name</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Full name of applicant"
                  className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:outline-none focus:ring-0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contact Info</label>
                <input
                  type="text"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="Phone or email"
                  className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:outline-none focus:ring-0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason for Cutting</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the reason for the cutting permit request..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Requirements: one compact box, the files listed inside it */}
          <div className="mt-6">
            <RequirementsDrop
              files={files}
              onAdd={addFiles}
              onRemove={removeFile}
              hint="1. Additional photos, 2. Barangay clearance"
            />
          </div>

          {submitError && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition disabled:opacity-50 inline-flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? 'Processing…' : 'Issue Permit'}
            </button>
          </div>
        </div>
      </div>

      {/* Certificate Print Component — hidden on screen, visible only during print */}
      {printData && (
        <CertificatePrint
          tree={printData.tree}
          clientName={printData.clientName}
          contactInfo={printData.contactInfo}
          reason={printData.reason}
        />
      )}
    </>
  );
}
