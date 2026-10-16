import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, Loader2, MapPinned } from 'lucide-react';
import { ACCEPTED_FILES, areaCandidates, readAreaFiles } from '../../lib/areaImport.js';
import { formatArea } from '../../lib/areaGeometry.js';
import Section, { buttonClass } from './Section.jsx';

/**
 * Areas brought in from a file — a GeoJSON, or a shapefile (zipped, or its
 * .shp with the .dbf and .prj). The file's areas are listed here; each opens
 * on the map, drawn and in the save form, to be checked and saved there.
 */
export default function ImportSection() {
  const navigate = useNavigate();
  const input = useRef(null);
  const [reading, setReading] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  async function read(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setReading(true);
    setError('');
    setCandidates(null);
    try {
      setCandidates(areaCandidates(await readAreaFiles(files)));
      setFileName(files.map((file) => file.name).join(', '));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setReading(false);
    }
  }

  const open = (candidate) =>
    navigate('/map', { state: { importArea: { name: candidate.name, geometry: candidate.geometry } } });

  return (
    <Section title="Import areas" description="Land cover or planting sites from a GeoJSON or shapefile">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Choose a GeoJSON, a zipped shapefile, or a shapefile&apos;s .shp with its .dbf and .prj together. Files in
          UTM zone 51N, PRS92 or Luzon 1911 are converted to longitude and latitude. Each area opens on the map to be
          checked and saved — one at a time, because each needs its own details.
        </p>
        <button type="button" onClick={() => input.current?.click()} disabled={reading}
          className={`${buttonClass} bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}>
          {reading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileUp size={15} aria-hidden="true" />}
          Choose a file
        </button>
        <input ref={input} type="file" multiple accept={ACCEPTED_FILES} onChange={read} className="hidden"
          aria-label="Area file (GeoJSON or shapefile)" />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {candidates && (
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {candidates.length} {candidates.length === 1 ? 'area' : 'areas'} in {fileName}
            </p>
            <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
              {candidates.map((candidate, i) => (
                <li key={candidate.index} className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-slate-200">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{candidate.name || `Area ${i + 1}`}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatArea(candidate.areaM2, candidate.areaM2 >= 10000 ? 'ha' : 'm2')}
                  </span>
                  <button type="button" onClick={() => open(candidate)}
                    aria-label={`Open ${candidate.name || `Area ${i + 1}`} on the map to save`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-green-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-800">
                    <MapPinned size={13} aria-hidden="true" /> Open on the map
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
