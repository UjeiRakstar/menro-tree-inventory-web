import { useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';

/**
 * Where a permit's requirements are attached: one compact box that takes a
 * drop or a click, and lists what was added inside itself.
 *
 * It was a tall drop area with the files listed below it — most of the
 * dialog spent on a button. Now the box is a line high when empty and grows
 * only by the chips of what is in it.
 */
export default function RequirementsDrop({ files, onAdd, onRemove, hint = '' }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="group"
      aria-label="Requirements"
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onAdd(Array.from(event.dataTransfer?.files ?? []));
      }}
      className={`rounded-lg border-2 border-dashed px-3 py-2.5 transition ${
        over ? 'border-green-500 bg-green-50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
        >
          <Paperclip size={13} aria-hidden="true" />
          {files.length > 0 ? 'Add more' : 'Attach requirements'}
        </button>
        {files.map((file, index) => (
          <span
            key={`${file.name}-${index}`}
            className="inline-flex max-w-[14rem] items-center gap-1 rounded-md bg-white py-1 pl-2 pr-1 text-xs text-slate-700 ring-1 ring-slate-200"
          >
            <FileText size={12} className="shrink-0 text-green-700" aria-hidden="true" />
            <span className="truncate" title={file.name}>{file.name}</span>
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${file.name}`}
              className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {files.length === 0 && (
          <span className="text-[11px] text-slate-500">or drop them here{hint ? ` — ${hint}` : ''}</span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,.pdf"
        aria-label="Requirement files"
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
        className="hidden"
      />
    </div>
  );
}
