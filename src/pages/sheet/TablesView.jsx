import { Download, Loader2, Printer } from 'lucide-react';
import { AttributeTable, Paper, PaperStack, SOURCES_NOTE, tablePages } from './Paper.jsx';
import { chartFor } from './Charts.jsx';

/** What the hazard page says while its figures are not in. */
export function measuringNote(measuring, lgu) {
  if (measuring === 'measuring' || measuring === 'idle') {
    return `Measuring each ${lgu ? 'barangay' : 'city and municipality'} against the flood, landslide, elevation and soil layers…`;
  }
  if (measuring === 'none') return 'PGENRO has not uploaded the flood, landslide, elevation or soil layers yet.';
  return '';
}

/**
 * The attribute tables, on A4 landscape pages as the DOST-PAGASA CLIRAM
 * sheets lay out their figures: each table with its chart under it, the
 * chart stretched to fill the page.
 */
export default function TablesView({
  heading,
  title,
  preparedBy,
  tables,
  chooseLgu = false,
  measuring = 'done',
  onExcel,
  exporting = false,
}) {
  const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const pages = tablePages(tables, { hasChart: (table) => Boolean(chartFor(table)) });
  const running = `${heading[0]} · ${title} · Attribute tables`;
  const note = measuringNote(measuring, !chooseLgu);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={onExcel} disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50">
          {exporting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
          Excel
        </button>
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
          <Printer size={15} aria-hidden="true" /> Print / PDF
        </button>
        <span className="text-xs text-slate-500">A4 landscape · {pages.length} {pages.length === 1 ? 'page' : 'pages'}</span>
        {chooseLgu && (
          <span className="text-xs text-slate-500">Choose a city or municipality in the Map tab for its barangays.</span>
        )}
      </div>

      <div className="print-target">
        <PaperStack>
          {pages.map((sheet, i) => (
            <Paper key={i} orientation="landscape"
              label={`Page ${i + 1}: ${(sheet.tables.length ? sheet.tables : sheet.charts).map((table) => table.title).join(' and ')}${sheet.tables.length ? '' : ', chart'}`}
              running={i === 0 ? '' : running} note={SOURCES_NOTE} page={i + 1} pages={pages.length}>
              {i === 0 && (
                <header className="text-center">
                  {heading.map((line, j) => (
                    <p key={line} className={j === 0 ? 'text-sm font-bold' : 'text-xs text-slate-600'}>{line}</p>
                  ))}
                  <h2 className="mt-1 text-lg font-extrabold">{title}</h2>
                  <p className="text-xs text-slate-500">Attribute tables · prepared by {preparedBy} · {date}</p>
                </header>
              )}
              {sheet.tables.map((table) => (
                <div key={table.key} className="contents">
                  {table.key === 'hazards' && note && (
                    <p role="status" className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">{note}</p>
                  )}
                  <AttributeTable table={table} />
                </div>
              ))}
              {sheet.charts.map((table) => chartFor(table))}
            </Paper>
          ))}
        </PaperStack>
      </div>
    </div>
  );
}
