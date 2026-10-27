import { FileSpreadsheet, FileText, Loader2, Printer, RotateCcw, Sparkles } from 'lucide-react';
import { AttributeTable, Paper, PaperStack } from './Paper.jsx';
import { chartFor } from './Charts.jsx';
import { measuringNote } from './TablesView.jsx';

const NOTE = 'For planning purposes only. Not a land title, survey plan or proof of ownership.';

/**
 * The Ecological Profile and Tree Inventory Report (27 October) on A4
 * portrait pages, part by part as its outline runs: each part's heading, its
 * maps, its tables with their charts, then its narrative — the office's to
 * edit in place, Improve with AI only proposing. A part longer than a page
 * grows onto the next sheet rather than being cut off.
 *
 *   report     buildEcologicalReport() — { title, maps, chapters }
 *   sections   the report's sections with the office's edits, by order
 *   mapImages  { [map key]: PNG URL } as the sheet captures them
 *   seal       the LGU's seal (or the province's), on the title page
 *   officeLogo the office's own logo from Settings, if it set one
 */
export default function ChapterReportView({
  heading,
  title,
  preparedBy,
  report,
  sections,
  mapImages = {},
  capturing = null,
  unavailable = [],
  failed = [],
  measuring = 'done',
  lgu = true,
  onChange,
  onRewrite,
  onImprove,
  onDocx,
  onXlsx,
  busy = '',
  note = null,
  seal = null,
  officeLogo = null,
}) {
  const button = 'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50';
  const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const running = `${heading[0]} · ${title}`;
  const measuringText = measuringNote(measuring, lgu);
  const textOf = new Map(sections.map((section) => [section.key, section.text]));
  const mapSpec = new Map((report.maps ?? []).map((map) => [map.key, map]));

  // Figures numbered through the whole report, in the order they are met.
  const figureNo = new Map();
  for (const part of report.chapters.flatMap((chapter) => chapter.parts)) {
    for (const key of part.maps) if (!figureNo.has(key)) figureNo.set(key, figureNo.size + 1);
  }
  const total = report.chapters.reduce((t, chapter) => t + chapter.parts.length, 0);
  let page = 0;

  const figure = (key, small) => {
    const map = mapSpec.get(key);
    if (!map) return null;
    const height = small ? 'max-h-[92mm]' : 'max-h-[110mm]';
    return (
      <figure key={key} className="flex flex-col">
        {mapImages[key] ? (
          <img src={mapImages[key]} alt={map.caption} className={`mx-auto ${height} w-auto max-w-full border border-slate-300 object-contain`} />
        ) : (
          <div className={`mx-auto flex aspect-[297/210] ${height} w-full items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500`}>
            {unavailable.includes(key) ? (
              'This layer has not been uploaded yet, so there is no map of it.'
            ) : failed.includes(key) ? (
              'The map could not be drawn. Open the Map tab, then come back to the report.'
            ) : capturing === key ? (
              <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Drawing the map…</span>
            ) : (
              'Waiting for the map…'
            )}
          </div>
        )}
        <figcaption className="mt-1 text-center text-[10px] italic text-slate-500">Figure {figureNo.get(key)}. {map.caption}</figcaption>
      </figure>
    );
  };

  const narrative = (section) => {
    const text = textOf.get(section.key) ?? section.text;
    return (
      <section key={section.key} aria-label={section.heading}>
        <textarea
          aria-label={`${section.heading} — text`}
          value={text}
          onChange={(event) => onChange(section.key, event.target.value)}
          rows={Math.max(2, Math.ceil(text.length / 95) + 1)}
          style={{ fieldSizing: 'content' }}
          className="w-full resize-none rounded border border-transparent bg-transparent p-0.5 text-justify text-[11pt] leading-relaxed text-slate-800 hover:border-slate-200 focus:border-green-500 focus:outline-none print:hidden"
        />
        <div className="hidden whitespace-pre-wrap text-justify text-[11pt] leading-relaxed print:block">{text}</div>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={onDocx} disabled={Boolean(busy) || Boolean(capturing)} className={`${button} bg-green-700 text-white hover:bg-green-800`}>
          {busy === 'docx' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
          Word (.docx)
        </button>
        <button type="button" onClick={onXlsx} disabled={Boolean(busy)} className={`${button} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
          {busy === 'xlsx' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={15} aria-hidden="true" />}
          Excel (.xlsx)
        </button>
        <button type="button" onClick={() => window.print()} disabled={Boolean(capturing)} className={`${button} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
          <Printer size={15} aria-hidden="true" /> Print / PDF
        </button>
        <span className="text-xs text-slate-500">A4 portrait · {total} parts · each with its maps, tables and narrative</span>
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
      {measuringText && (
        <p role="status" className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200 print:hidden">
          {measuringText} The figures are written in once they are measured.
        </p>
      )}

      <div className="print-target">
        <PaperStack>
          {report.chapters.map((chapter) =>
            chapter.parts.map((part, i) => {
              page += 1;
              const first = page === 1;
              return (
                <Paper key={part.key} label={first ? title : part.heading ?? chapter.heading} running={first ? '' : running} note={NOTE} page={page} pages={total}>
                  {first && (
                    <header className="text-center">
                      {/* The letterhead: the LGU's seal, the heading, the office's own logo. */}
                      <div className="flex items-center justify-center gap-4">
                        {seal ? <img src={seal} alt="Seal" className="h-[22mm] w-[22mm] object-contain" /> : <span className="w-[22mm]" />}
                        <div>
                          <p className="text-xs text-slate-600">Republic of the Philippines</p>
                          {heading.map((line, j) => (
                            <p key={line} className={j === 0 ? 'text-sm font-bold' : 'text-xs text-slate-600'}>{line}</p>
                          ))}
                        </div>
                        {officeLogo ? <img src={officeLogo} alt="Office logo" className="h-[22mm] w-[22mm] object-contain" /> : <span className="w-[22mm]" />}
                      </div>
                      <h2 className="mt-3 text-xl font-extrabold">{title}</h2>
                      <p className="text-xs italic text-slate-500">Prepared by {preparedBy} · {date}</p>
                    </header>
                  )}
                  {i === 0 && <h3 className="text-[14pt] font-extrabold text-slate-900">{chapter.heading}</h3>}
                  {part.heading && part.heading !== chapter.heading && <h4 className="text-[12pt] font-bold text-slate-800">{part.heading}</h4>}
                  {part.maps.map((key) => figure(key, part.maps.length > 1))}
                  {part.tables.map((table) => (
                    <div key={table.key} className="space-y-2">
                      <AttributeTable table={table} size="text-[8.5px]" />
                      {chartFor(table, { minHeight: '55mm', maxHeight: '80mm' })}
                    </div>
                  ))}
                  {part.sections.map(narrative)}
                </Paper>
              );
            })
          )}
        </PaperStack>
      </div>
    </div>
  );
}
