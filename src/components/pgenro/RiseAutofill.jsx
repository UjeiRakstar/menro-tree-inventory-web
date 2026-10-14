import { useId, useState } from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { cleanExtraction } from '../../lib/riseFields.js';

/**
 * TEMPORARY: fill the species form in from a RISE PDF.
 *
 * Here to get a backlog of RISE issues encoded quickly, and meant to be
 * removed afterwards — with supabase/functions/rise-extract, which holds the
 * Gemini key and does the reading. Removing it is deleting this file and the
 * one place SpeciesEditor shows it; the form works without it.
 *
 * Nothing is saved from here. What Gemini read goes into the form, every field
 * it filled is marked, and the forester checks them before saving.
 */
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

/** The file as base64, without the "data:…;base64," in front. */
function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/** The server function's answer, or a sentence saying what went wrong. */
async function readRise(file) {
  const pdf = await readAsBase64(file);
  const { data, error } = await supabase.functions.invoke('rise-extract', {
    body: { pdf, file_name: file.name },
  });
  if (error) {
    // A non-2xx answer carries the function's own message in its body.
    let message = null;
    try {
      message = (await error.context?.json?.())?.error ?? null;
    } catch {
      // Not JSON: fall through to the generic reading below.
    }
    if (message) return { error: message };
    const missing = /not found|404|failed to send/i.test(error.message ?? '');
    return {
      error: missing
        ? 'The PDF reader is not deployed yet. See supabase/functions/rise-extract/index.ts for how.'
        : error.message ?? 'The PDF could not be read.',
    };
  }
  if (data?.error) return { error: data.error };
  return { result: cleanExtraction(data) };
}

export default function RiseAutofill({ onFilled }) {
  const inputId = useId();
  const [file, setFile] = useState(null);
  const [problem, setProblem] = useState('');
  const [reading, setReading] = useState(false);
  const [choices, setChoices] = useState(null);

  function handleChoose(event) {
    const chosen = event.target.files?.[0] ?? null;
    setChoices(null);
    setProblem('');
    if (!chosen) {
      setFile(null);
      return;
    }
    if (chosen.type && chosen.type !== 'application/pdf') {
      setFile(null);
      setProblem('That is not a PDF.');
      return;
    }
    if (chosen.size > MAX_PDF_BYTES) {
      setFile(null);
      setProblem('That PDF is over 8 MB. Split it, or type this one in.');
      return;
    }
    setFile(chosen);
  }

  async function handleRead() {
    if (!file) return;
    setReading(true);
    setProblem('');
    setChoices(null);
    const { result, error } = await readRise(file);
    setReading(false);
    if (error) {
      setProblem(error);
      return;
    }
    if (result.species.length === 0) {
      setProblem('No species could be read from that PDF. Type this one in.');
      return;
    }
    if (result.species.length === 1) {
      onFilled(result.species[0]);
      return;
    }
    setChoices(result.species);
  }

  return (
    <section
      aria-label="Fill in from a RISE PDF"
      className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-violet-900">
        <Sparkles size={16} aria-hidden="true" /> Fill in from a RISE PDF
        <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
          Temporary
        </span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-violet-900/80">
        Gemini reads the issue and fills in the form below. Nothing is saved until you check what it
        read and press Save. The PDF goes to Google to be read.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-violet-800 ring-1 ring-violet-200 hover:bg-violet-50"
        >
          <FileText size={14} aria-hidden="true" />
          {file ? file.name : 'Choose a RISE PDF'}
        </label>
        <input
          id={inputId}
          type="file"
          accept="application/pdf"
          onChange={handleChoose}
          className="sr-only"
          aria-label="RISE PDF"
        />
        <button
          type="button"
          onClick={handleRead}
          disabled={!file || reading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {reading ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Reading — up to a minute…
            </>
          ) : (
            'Read it'
          )}
        </button>
      </div>

      {problem && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {problem}
        </p>
      )}

      {choices && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-violet-900">
            This issue covers {choices.length} species. Which one is this form for?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button
                key={choice.species}
                type="button"
                onClick={() => {
                  setChoices(null);
                  onFilled(choice);
                }}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                {choice.species}
                {choice.scientific_name && (
                  <span className="ml-1 font-normal italic text-slate-500">{choice.scientific_name}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
