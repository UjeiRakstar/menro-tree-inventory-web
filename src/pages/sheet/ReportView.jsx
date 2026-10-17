import { FileText, Loader2, Printer, RotateCcw, Sparkles } from 'lucide-react';

/**
 * The written report (option C, 17 October): written by the system from the
 * figures, every section the office's to edit, and an Improve with AI that
 * only proposes — the office reads it through before it uses it.
 */
export default function ReportView({
  heading,
  title,
  preparedBy,
  sections,
  onChange,
  onRewrite,
  onImprove,
  onDocx,
  busy = '',
  note = null,
}) {
  const button = 'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={onDocx} disabled={Boolean(busy)} className={`${button} bg-green-700 text-white hover:bg-green-800`}>
          {busy === 'docx' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
          Word (.docx)
        </button>
        <button type="button" onClick={() => window.print()} className={`${button} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
          <Printer size={15} aria-hidden="true" /> Print / PDF
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onImprove} disabled={Boolean(busy)} className={`${button} bg-amber-400 text-slate-900 hover:bg-amber-300`}>
          {busy === 'improve' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
          Improve with AI
        </button>
        <button type="button" onClick={onRewrite} disabled={Boolean(busy)} className={`${button} text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}>
          <RotateCcw size={15} aria-hidden="true" /> Write again from the figures
        </button>
      </div>
      {note && (
        <p role={note.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm print:hidden ${note.ok ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-red-50 text-red-700'}`}>
          {note.text}
        </p>
      )}

      <article className="print-target mx-auto max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="text-center">
          <p className="text-xs text-slate-600">Republic of the Philippines</p>
          {heading.map((line, i) => (
            <p key={line} className={i === 0 ? 'text-sm font-bold text-slate-900' : 'text-xs text-slate-600'}>{line}</p>
          ))}
          <h2 className="mt-3 text-xl font-extrabold text-slate-900">{title}</h2>
          <p className="text-xs italic text-slate-500">
            Prepared by {preparedBy} · {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </header>
        {sections.map((section) => (
          <section key={section.key} aria-label={section.heading}>
            <h3 className="text-base font-bold text-slate-900">{section.heading}</h3>
            <textarea
              aria-label={`${section.heading} — text`}
              value={section.text}
              onChange={(event) => onChange(section.key, event.target.value)}
              rows={Math.max(3, Math.ceil(section.text.length / 110))}
              className="mt-1 w-full resize-y rounded-lg border border-transparent bg-transparent p-1 text-[14px] leading-relaxed text-slate-800 hover:border-slate-200 focus:border-green-500 focus:outline-none print:hidden"
            />
            {/* The text as printed: a textarea does not print its whole content. */}
            <div className="hidden whitespace-pre-wrap text-[12pt] leading-relaxed print:block">{section.text}</div>
          </section>
        ))}
        <p className="text-[11px] italic text-slate-500">
          For planning purposes only. Not a land title, survey plan or proof of ownership.
        </p>
      </article>
    </div>
  );
}
