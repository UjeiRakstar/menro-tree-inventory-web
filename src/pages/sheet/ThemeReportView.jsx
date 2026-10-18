import { FileText, Loader2, Printer, RotateCcw, Sparkles } from 'lucide-react';
import { AttributeTable, Paper, PaperStack, SOURCES_NOTE, tablePages } from './Paper.jsx';
import { chartFor } from './Charts.jsx';
import { sectionPages } from './ReportView.jsx';
import { measuringNote } from './TablesView.jsx';

/**
 * A thematic report on A4 portrait pages, in the order decided on 18 October:
 *
 *   1. the maps, two to a page after the first
 *   2. the tables, each with its chart under it — or on a page of its own when
 *      the table leaves no room
 *   3. the narrative, written from those tables, ending with what they mean
 *      for the FLUP, CLUP / CDP, eLCCAP and CBI; every paragraph the office's
 *      to edit, Improve with AI only proposing
 *
 *   report     buildThemeReport() — { title, maps, tables, sections }
 *   mapImages  { [map key]: PNG URL } as the sheet captures them
 *   capturing  the map key being captured now, or null
 *   unavailable  map keys whose layer is not uploaded
 *   failed     map keys the sheet could not be drawn for
 */
export default function ThemeReportView({
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
  busy = '',
  note = null,
}) {
  const button = 'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50';
  const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const running = `${heading[0]} · ${title}`;
  const measuringText = measuringNote(measuring, lgu);

  const maps = report.maps ?? [];
  const mapPages = Array.from({ length: Math.ceil(maps.length / 2) }, (_, i) => maps.slice(i * 2, i * 2 + 2));
  const tableSheets = tablePages(report.tables.filter(Boolean), {
    hasChart: (table) => Boolean(chartFor(table)),
    pageMm: 255,
    headingMm: 10,
    chartMm: 70,
    rowMm: 4.4,
  });
  const textPages = sectionPages(sections);
  const total = Math.max(1, mapPages.length) + tableSheets.length + textPages.length;
  let page = 0;

  const figure = (map, index) => (
    <figure key={map.key} className="flex flex-col">
      {mapImages[map.key] ? (
        <img src={mapImages[map.key]} alt={map.caption} className="mx-auto max-h-[105mm] w-auto max-w-full border border-slate-300 object-contain" />
      ) : (
        <div className="mx-auto flex aspect-[297/210] max-h-[105mm] w-full items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
          {unavailable.includes(map.key) ? (
            'This layer has not been uploaded yet, so there is no map of it.'
          ) : failed.includes(map.key) ? (
            'The map could not be drawn. Open the Map tab, then come back to the report.'
          ) : capturing === map.key ? (
            <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Drawing the map…</span>
          ) : (
            'Waiting for the map…'
          )}
        </div>
      )}
      <figcaption className="mt-1 text-center text-[10px] italic text-slate-500">Figure {index + 1}. {map.caption}</figcaption>
    </figure>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={onDocx} disabled={Boolean(busy) || Boolean(capturing)} className={`${button} bg-green-700 text-white hover:bg-green-800`}>
          {busy === 'docx' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
          Word (.docx)
        </button>
        <button type="button" onClick={() => window.print()} disabled={Boolean(capturing)} className={`${button} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
          <Printer size={15} aria-hidden="true" /> Print / PDF
        </button>
        <span className="text-xs text-slate-500">A4 portrait · {total} pages · maps, then tables and figures, then the narrative</span>
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
          {(mapPages.length ? mapPages : [[]]).map((group, i) => {
            page += 1;
            return (
              <Paper key={`maps-${i}`} label={i === 0 ? title : `Maps, page ${page}`} running={i === 0 ? '' : running}
                note="For planning purposes only. Not a land title, survey plan or proof of ownership." page={page} pages={total}>
                {i === 0 && (
                  <header className="text-center">
                    <p className="text-xs text-slate-600">Republic of the Philippines</p>
                    {heading.map((line, j) => (
                      <p key={line} className={j === 0 ? 'text-sm font-bold' : 'text-xs text-slate-600'}>{line}</p>
                    ))}
                    <h2 className="mt-2 text-xl font-extrabold">{title}</h2>
                    <p className="text-xs italic text-slate-500">Prepared by {preparedBy} · {date}</p>
                  </header>
                )}
                {i === 0 && <h3 className="text-[13pt] font-bold">Maps</h3>}
                {group.map((map) => figure(map, maps.indexOf(map)))}
              </Paper>
            );
          })}
          {tableSheets.map((sheet, i) => {
            page += 1;
            return (
              <Paper key={`tables-${i}`} label={`Tables and figures, page ${page}`} running={running} note={SOURCES_NOTE} page={page} pages={total}>
                {i === 0 && <h3 className="text-[13pt] font-bold">Tables and figures</h3>}
                {sheet.items.map((item) =>
                  item.kind === 'chart' ? (
                    chartFor(item.table, { minHeight: '65mm', maxHeight: '110mm' })
                  ) : (
                    <AttributeTable key={item.table.key} table={item.table} size="text-[8.5px]" />
                  )
                )}
              </Paper>
            );
          })}
          {textPages.map((group, i) => {
            page += 1;
            return (
              <Paper key={`text-${i}`} label={`Narrative, page ${page}`} running={running}
                note="For planning purposes only. Not a land title, survey plan or proof of ownership." page={page} pages={total}>
                {i === 0 && <h3 className="text-[13pt] font-bold">What the maps and tables show</h3>}
                {group.map((section) => (
                  <section key={section.key} aria-label={section.heading}>
                    <h4 className="text-[12pt] font-bold">{section.heading}</h4>
                    <textarea
                      aria-label={`${section.heading} — text`}
                      value={section.text}
                      onChange={(event) => onChange(section.key, event.target.value)}
                      rows={Math.max(2, Math.ceil(section.text.length / 95) + 1)}
                      style={{ fieldSizing: 'content' }}
                      className="mt-0.5 w-full resize-none rounded border border-transparent bg-transparent p-0.5 text-justify text-[11pt] leading-relaxed text-slate-800 hover:border-slate-200 focus:border-green-500 focus:outline-none print:hidden"
                    />
                    <div className="hidden whitespace-pre-wrap text-justify text-[11pt] leading-relaxed print:block">{section.text}</div>
                  </section>
                ))}
              </Paper>
            );
          })}
        </PaperStack>
      </div>
    </div>
  );
}
