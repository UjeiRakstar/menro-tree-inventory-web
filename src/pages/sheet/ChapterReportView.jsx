import { FileSpreadsheet, FileText, Loader2, Printer, RotateCcw, Sparkles } from 'lucide-react';
import { AttributeTable } from './Paper.jsx';
import { chartFor } from './Charts.jsx';
import { measuringNote } from './TablesView.jsx';

const NOTE = 'For planning purposes only. Not a land title, survey plan or proof of ownership.';

/**
 * The Ecological Profile and Tree Inventory Report (27 October), part by
 * part as its outline runs: each part's heading, its maps, its tables with
 * their charts, then its narrative — the office's to edit in place, Improve
 * with AI only proposing. Each chapter is one sheet on screen; printed, it
 * flows over as many A4 pages as it needs (see the sheet's print rules).
 *
 *   report     buildEcologicalReport() — { title, maps, chapters }; with
 *              `readOnly` (the management plan, 29 October) its text is
 *              shown, not edited, and the office completes it in Word
 *   sections   the report's sections with the office's edits, by order
 *   mapImages  { [map key]: PNG URL } as the sheet captures them
 *   seal       the LGU's seal (or the province's), on the title page
 *   officeLogo the office's own logo from Settings, if it set one
 *   chooser    which report: shown at the top of the toolbar
 *
 * Each chart carries `data-chart` (its table's key), so the Word file can
 * take a picture of it.
 */
export default function ChapterReportView({
  heading,
  title,
  preparedBy,
  report,
  sections,
  chooser = null,
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
  // A placeholder still as written is the office's to fill: shown so on screen.
  const writtenOf = new Map((report.sections ?? []).map((section) => [section.key, section.text]));
  const mapSpec = new Map((report.maps ?? []).map((map) => [map.key, map]));
  // The plan's table of contents: every heading after it, as its outline nests them.
  const contentsAt = report.chapters.findIndex((chapter) => chapter.contents);
  const contents = contentsAt < 0 ? [] : report.chapters.slice(contentsAt + 1).flatMap((chapter) => [
    { key: chapter.key, text: chapter.heading, level: 1 },
    ...chapter.parts.filter((p) => p.heading).map((p) => ({ key: `${chapter.key}/${p.key}`, text: p.heading, level: p.level ?? 2 })),
  ]);

  // Figures numbered through the whole report, in the order they are met.
  const figureNo = new Map();
  for (const part of report.chapters.flatMap((chapter) => chapter.parts)) {
    for (const key of part.maps) if (!figureNo.has(key)) figureNo.set(key, figureNo.size + 1);
  }
  const total = report.chapters.reduce((t, chapter) => t + chapter.parts.length, 0);
  const readOnly = Boolean(report.readOnly);
  // The maps still to draw: Word and Print wait for them, and say so.
  const mapKeys = (report.maps ?? []).map((map) => map.key);
  const mapsReady = mapKeys.filter((key) => mapImages[key] || unavailable.includes(key) || failed.includes(key)).length;
  const drawing = Boolean(capturing);

  const figure = (key, small) => {
    const map = mapSpec.get(key);
    if (!map) return null;
    const height = small ? 'max-h-[92mm]' : 'max-h-[110mm]';
    return (
      <figure key={key} className="flex break-inside-avoid flex-col">
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
    const pending = section.placeholder && text === writtenOf.get(section.key);
    const align = section.center ? 'text-center' : 'text-justify';
    if (readOnly) {
      return (
        <section key={section.key} aria-label={section.heading}>
          <div
            className={`whitespace-pre-wrap ${align} text-[11pt] leading-relaxed ${
              pending ? 'rounded border border-dashed border-amber-300 bg-amber-50 px-1 italic text-amber-900 print:border-0 print:bg-transparent print:px-0 print:text-slate-800' : 'text-slate-800'
            }`}
            style={{ orphans: 3, widows: 3 }}
          >
            {text}
          </div>
        </section>
      );
    }
    return (
      <section key={section.key} aria-label={section.heading}>
        <textarea
          aria-label={`${section.heading} — text`}
          value={text}
          onChange={(event) => onChange(section.key, event.target.value)}
          rows={Math.max(2, Math.ceil(text.length / 95) + 1)}
          style={{ fieldSizing: 'content' }}
          className={`w-full resize-none rounded border p-0.5 ${align} text-[11pt] leading-relaxed hover:border-slate-200 focus:border-green-500 focus:outline-none print:hidden ${
            pending ? 'border-dashed border-amber-300 bg-amber-50 italic text-amber-900' : 'border-transparent bg-transparent text-slate-800'
          }`}
        />
        <div className={`hidden whitespace-pre-wrap ${align} text-[11pt] leading-relaxed print:block`} style={{ orphans: 3, widows: 3 }}>{text}</div>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {/* The toolbar: which report, then what to do with it. */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm print:hidden">
        {chooser}
        <div className={`flex flex-wrap items-center gap-2 ${chooser ? 'border-t border-slate-100 pt-3' : ''}`}>
          <button type="button" onClick={onDocx} disabled={Boolean(busy) || drawing} className={`${button} bg-green-700 text-white hover:bg-green-800`}>
            {busy === 'docx' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
            Word (.docx)
          </button>
          <button type="button" onClick={onXlsx} disabled={Boolean(busy)} className={`${button} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
            {busy === 'xlsx' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={15} aria-hidden="true" />}
            Excel (.xlsx)
          </button>
          <button type="button" onClick={() => window.print()} disabled={drawing} className={`${button} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
            <Printer size={15} aria-hidden="true" /> Print / PDF
          </button>
          {drawing ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              Drawing the maps, {Math.min(mapsReady + 1, mapKeys.length)} of {mapKeys.length} — Word and Print are ready when they are.
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              A4 portrait · {total} parts{readOnly ? ' · a preview: download Word to complete it' : ' · each with its maps, tables and narrative'}
            </span>
          )}
          {!readOnly && (
            <>
              <span className="flex-1" />
              <button type="button" onClick={onImprove} disabled={Boolean(busy)} className={`${button} bg-amber-400 text-slate-900 hover:bg-amber-300`}>
                {busy === 'improve' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
                Improve with AI
              </button>
              <button type="button" onClick={onRewrite} disabled={Boolean(busy)} className={`${button} text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}>
                <RotateCcw size={15} aria-hidden="true" /> Write again from the figures
              </button>
            </>
          )}
        </div>
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

      {/* One sheet per chapter, as long as it needs to be. Printed, the chapters
          each start on a new page and their content flows from page to page:
          a map, a chart or a heading is never split; a long table continues
          with its header row repeated; the page margins carry the running
          head, the planning line and the page number (MapSheet's @page). */}
      <div className="print-target">
        <div className="overflow-x-auto rounded-2xl bg-slate-200 py-6 print:overflow-visible print:rounded-none print:bg-transparent print:py-0">
          <div className="mx-auto w-max space-y-6 px-4 print:w-auto print:space-y-0 print:px-0">
          {report.chapters.map((chapter, c) => (
            <section
              key={chapter.key}
              aria-label={c === 0 ? title : chapter.heading}
              className={`report-chapter flex w-[210mm] flex-col gap-4 bg-white p-[15mm] text-slate-900 shadow-lg print:w-auto print:p-0 print:shadow-none ${c > 0 ? 'break-before-page' : ''} ${
                c === 0 && !chapter.heading ? 'min-h-[297mm] justify-center print:min-h-0 print:pt-[50mm]' : ''
              }`}
            >
              {c > 0 && <p className="border-b border-slate-200 pb-1 text-[9px] text-slate-500 print:hidden">{running}</p>}
              {chapter.parts.map((part, i) => {
              const first = c === 0 && i === 0;
              return (
                <section key={part.key} aria-label={part.heading ?? chapter.heading} className="flex flex-col gap-4">
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
                      {(report.subtitle ?? []).map((line) => (
                        <p key={line} className="text-sm text-slate-700">{line}</p>
                      ))}
                      <p className="text-xs italic text-slate-500">Prepared by {preparedBy} · {date}</p>
                    </header>
                  )}
                  {i === 0 && chapter.heading && <h3 className="break-after-avoid text-[14pt] font-extrabold text-slate-900">{chapter.heading}</h3>}
                  {chapter.contents && (
                    <nav aria-label="Contents">
                      <ol className="space-y-0.5 text-[10.5pt] text-slate-800">
                        {contents.map((entry) => (
                          <li key={entry.key} className={entry.level === 1 ? 'mt-1.5 font-bold' : entry.level === 2 ? 'pl-5' : 'pl-10 text-[10pt] text-slate-700'}>
                            {entry.text}
                          </li>
                        ))}
                      </ol>
                    </nav>
                  )}
                  {part.heading && part.heading !== chapter.heading && (part.level === 3 ? (
                    <h5 className="break-after-avoid pl-4 text-[11pt] font-semibold text-slate-800">{part.heading}</h5>
                  ) : (
                    <h4 className="break-after-avoid text-[12pt] font-bold text-slate-800">{part.heading}</h4>
                  ))}
                  {part.maps.map((key) => figure(key, part.maps.length > 1))}
                  {part.tables.map((table) => {
                    const chart = chartFor(table, { minHeight: '55mm', maxHeight: '80mm' });
                    return (
                      <div key={table.key} className="space-y-2">
                        <AttributeTable table={table} size="text-[8.5px]" flow />
                        {chart && <div data-chart={table.key} className="break-inside-avoid">{chart}</div>}
                      </div>
                    );
                  })}
                  {part.sections.map(narrative)}
                </section>
              );
              })}
              <p className="mt-auto border-t border-slate-200 pt-1 text-[8px] text-slate-400 print:hidden">{NOTE}</p>
            </section>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
