import { FileText, Loader2, Printer, RotateCcw, Sparkles } from 'lucide-react';
import { AttributeTable, Paper, PaperStack, SOURCES_NOTE, tablePages } from './Paper.jsx';
import { carbonChart, coverChart, hazardChart, treesChart } from './Charts.jsx';
import { measuringNote } from './TablesView.jsx';

// What fits on a portrait A4 page, in lines of 11-point text across 186 mm.
const CHARS_PER_LINE = 95;
const LINES_PER_PAGE = 42;
const HEADING_LINES = 7;
const MAP_LINES = 23;

const linesOf = (text) =>
  text.split(/\n+/).reduce((lines, paragraph) => lines + Math.max(1, Math.ceil(paragraph.length / CHARS_PER_LINE)) + 0.6, 0);

/**
 * The sections, a page at a time — estimated, not measured, so a page may run
 * a little short or long; one that runs long grows rather than lose its end.
 */
export function sectionPages(sections, { withMap = false } = {}) {
  const pages = [[]];
  let room = LINES_PER_PAGE - HEADING_LINES - (withMap ? MAP_LINES : 0);
  for (const section of sections) {
    const need = 2.5 + linesOf(section.text);
    if (need > room && (pages.at(-1).length > 0 || withMap)) {
      pages.push([]);
      room = LINES_PER_PAGE;
    }
    pages.at(-1).push(section);
    room -= need;
  }
  return pages;
}

/**
 * The written report (option C, 17 October), on A4 portrait pages: written by
 * the system from the figures, every section the office's to edit in place,
 * and an Improve with AI that only proposes — the office reads it through
 * before it uses it. The map, the charts and the tables follow the text, as
 * in the Word document.
 */
export default function ReportView({
  heading,
  title,
  preparedBy,
  sections,
  tables = [],
  mapImage = null,
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
  const textPages = sectionPages(sections, { withMap: Boolean(mapImage) });
  const byKey = Object.fromEntries(tables.map((table) => [table.key, table]));
  const charts = [
    treesChart(byKey.barangays, { minHeight: '55mm' }),
    hazardChart(byKey.hazards, { minHeight: '55mm' }),
    carbonChart(byKey.carbon, { minHeight: '55mm' }),
    coverChart(byKey['land-cover'], { minHeight: '55mm' }),
  ].filter(Boolean);
  const chartPages = [];
  for (let i = 0; i < charts.length; i += 3) chartPages.push(charts.slice(i, i + 3));
  const tableGroups = tablePages(tables, { pageMm: 255, headingMm: 10 }).map((sheet) => sheet.tables);
  const total = textPages.length + chartPages.length + tableGroups.length;
  const running = `${heading[0]} · ${title}`;
  const measuringText = measuringNote(measuring, lgu);
  let page = 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={onDocx} disabled={Boolean(busy)} className={`${button} bg-green-700 text-white hover:bg-green-800`}>
          {busy === 'docx' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
          Word (.docx)
        </button>
        <button type="button" onClick={() => window.print()} className={`${button} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
          <Printer size={15} aria-hidden="true" /> Print / PDF
        </button>
        <span className="text-xs text-slate-500">A4 portrait · {total} pages · click any paragraph to edit it</span>
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
          {measuringText} The exposure to hazards is written in once it is measured.
        </p>
      )}

      <div className="print-target">
        <PaperStack>
          {textPages.map((group, i) => {
            page += 1;
            return (
              <Paper key={`text-${i}`} label={i === 0 ? title : `${title}, page ${page}`} running={i === 0 ? '' : running}
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
                {i === 0 && mapImage && (
                  <figure>
                    <img src={mapImage} alt={`The map sheet: ${title.replace(/ — REPORT$/, '')}`} className="w-full border border-slate-300" />
                    <figcaption className="mt-1 text-center text-[10px] italic text-slate-500">Figure 1. {title.replace(/ — REPORT$/, '')}</figcaption>
                  </figure>
                )}
                {group.map((section) => (
                  <section key={section.key} aria-label={section.heading}>
                    <h3 className="text-[13pt] font-bold">{section.heading}</h3>
                    <textarea
                      aria-label={`${section.heading} — text`}
                      value={section.text}
                      onChange={(event) => onChange(section.key, event.target.value)}
                      rows={Math.max(2, Math.ceil(linesOf(section.text)))}
                      style={{ fieldSizing: 'content' }}
                      className="mt-0.5 w-full resize-none rounded border border-transparent bg-transparent p-0.5 text-justify text-[11pt] leading-relaxed text-slate-800 hover:border-slate-200 focus:border-green-500 focus:outline-none print:hidden"
                    />
                    {/* The text as printed: a textarea does not print its whole content. */}
                    <div className="hidden whitespace-pre-wrap text-justify text-[11pt] leading-relaxed print:block">{section.text}</div>
                  </section>
                ))}
              </Paper>
            );
          })}
          {chartPages.map((group, i) => {
            page += 1;
            return (
              <Paper key={`charts-${i}`} label={`Figures, page ${page}`} running={running} note={SOURCES_NOTE} page={page} pages={total}>
                {i === 0 && <h3 className="text-[13pt] font-bold">Figures</h3>}
                {group}
              </Paper>
            );
          })}
          {tableGroups.map((group, i) => {
            page += 1;
            return (
              <Paper key={`table-${group[0].key}`} label={`Tables, page ${page}`} running={running} note={SOURCES_NOTE} page={page} pages={total}>
                {i === 0 && <h3 className="text-[13pt] font-bold">Tables</h3>}
                {group.map((table) => <AttributeTable key={table.key} table={table} size="text-[8.5px]" />)}
              </Paper>
            );
          })}
        </PaperStack>
      </div>
    </div>
  );
}
