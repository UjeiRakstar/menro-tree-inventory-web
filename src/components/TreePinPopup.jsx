import { useState } from 'react';
import PropTypes from 'prop-types';
import { TreeRecordPropType } from '../types.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Enhanced popup body rendered inside a Leaflet <Popup> for a single Tree_Pin.
 *
 * Shows: scrollable image carousel (up to 4 photos), species name + type,
 * assignment status with color indicator, and action buttons.
 */
export default function TreePinPopup({ tree, color, onDispatch, onIssuePermit }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Collect all available image URLs into a carousel array
  const images = [
    tree.photo_url && { url: tree.photo_url, label: 'Main' },
    tree.leaves_url && { url: tree.leaves_url, label: 'Leaves' },
    tree.bark_url && { url: tree.bark_url, label: 'Bark' },
    tree.fruits_url && { url: tree.fruits_url, label: 'Fruits' },
  ].filter(Boolean);

  // Also check camelCase variants
  if (images.length === 0) {
    const altImages = [
      tree.imageUrl && { url: tree.imageUrl, label: 'Main' },
      tree.leavesUrl && { url: tree.leavesUrl, label: 'Leaves' },
      tree.barkUrl && { url: tree.barkUrl, label: 'Bark' },
      tree.fruitsUrl && { url: tree.fruitsUrl, label: 'Fruits' },
    ].filter(Boolean);
    images.push(...altImages);
  }

  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;

  function nextSlide() {
    setCurrentSlide((prev) => (prev + 1) % images.length);
  }
  function prevSlide() {
    setCurrentSlide((prev) => (prev - 1 + images.length) % images.length);
  }

  const isGreen = color === 'Green';
  const assignedTo = tree.assigned_to;

  let statusColor = 'bg-green-500';
  let statusText = 'Healthy';
  if (color === 'Red') {
    statusColor = 'bg-red-500';
    statusText = 'Unassigned Hazard';
  } else if (color === 'Orange') {
    statusColor = 'bg-orange-500';
    statusText = `Working: ${assignedTo}`;
  } else if (color === 'Yellow') {
    statusColor = 'bg-amber-500';
    statusText = 'Permit Issued';
  }

  return (
    <div className="w-64 text-slate-800">
      {/* Image carousel */}
      <div className="relative w-full h-36 rounded-t-lg overflow-hidden bg-slate-100 mb-3">
        {hasImages ? (
          <>
            <img
              src={images[currentSlide].url}
              alt={`${tree.species} - ${images[currentSlide].label}`}
              className="object-cover w-full h-full"
              onError={(e) => { e.target.style.display = 'none'; }}
            />

            {/* Navigation arrows */}
            {hasMultiple && (
              <>
                <button
                  onClick={prevSlide}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={nextSlide}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition"
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}

            {/* Slide indicator dots + label */}
            <div className="absolute bottom-1 left-0 right-0 flex items-center justify-center gap-1">
              {hasMultiple && images.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition ${
                    i === currentSlide ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
            <span className="absolute top-1 right-1 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded">
              {images[currentSlide].label}
            </span>
          </>
        ) : (
          <div
            data-testid="tree-photo-placeholder"
            aria-label="No photo available"
            className="w-full h-full flex items-center justify-center text-slate-400 text-xs"
          >
            No photo available
          </div>
        )}
      </div>

      {/* Tree details */}
      <div className="px-1">
        <h3 className="text-base font-bold text-slate-900">{tree.species}</h3>
        <p className="text-xs text-slate-500 mb-2">{tree.biodiversity_status || tree.species_type || 'Unknown'}</p>

        <dl className="text-xs text-slate-600 space-y-0.5 mb-3">
          <div className="flex justify-between">
            <dt className="font-medium">Tree ID:</dt>
            <dd>{tree.tree_id || tree.id?.slice(0, 8) || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-medium">DBH:</dt>
            <dd>{tree.dbh}</dd>
          </div>
        </dl>

        {/* Status indicator */}
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
          <span className="text-slate-600 truncate">{statusText}</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onDispatch?.(tree)}
            disabled={isGreen}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isGreen
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : color === 'Orange'
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {color === 'Orange' ? 'Re-assign' : 'Dispatch'}
          </button>
          <button
            type="button"
            onClick={() => onIssuePermit?.(tree)}
            disabled={tree.has_cutting_permit || tree.hasCuttingPermit}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tree.has_cutting_permit || tree.hasCuttingPermit
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-green-700 text-white hover:bg-green-800'
            }`}
          >
            Permit
          </button>
        </div>
      </div>
    </div>
  );
}

TreePinPopup.propTypes = {
  tree: TreeRecordPropType.isRequired,
  color: PropTypes.oneOf(['Red', 'Orange', 'Yellow', 'Green']).isRequired,
  onDispatch: PropTypes.func,
  onIssuePermit: PropTypes.func,
};
