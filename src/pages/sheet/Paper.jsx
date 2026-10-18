import { formatCell } from '../../lib/attributeTables.js';

/**
 * A4 sheets, as the Tables and Report tabs show and print them: white pages on
 * a grey desk, each the paper's size, with a running head and a footer. A page
 * whose content runs longer grows rather than cut it off, and prints on as
 * many sheets as it needs.
 */
export const A4 = Object.freeze({
  portrait: Object.freeze({ width: 210, height: 297 }),
  landscape: Object.freeze({ width: 297, height: 210 }),
});

export function PaperStack({ children }) {
  return (
    <div className="paper-stack overflow-x-auto rounded-2xl bg-slate-200 py-6 print:overflow-visible print:rounded-none print:bg-transparent print:py-0">
      <div className="mx-auto w-max space-y-6 px-4 print:space-y-0 print:px-0">{children}</div>
    </div>
  );
}

export function Paper({ orientation = 'portrait', label, running = '', note = '', page, pages, children }) {
  const { width, height } = A4[orientation];
  return (
    <section
      aria-label={label}
      className="paper flex flex-col bg-white text-slate-900 shadow-lg print:shadow-none"
      style={{ width: `${width}mm`, minHeight: `${height}mm`, padding: '12mm' }}
    >
      {running && <p className="mb-3 border-b border-slate-200 pb-1 text-[9px] text-slate-500">{running}</p>}
      <div className="flex flex-1 flex-col gap-4">{children}</div>
      <p className="mt-3 flex justify-between gap-4 border-t border-slate-200 pt-1 text-[8px] leading-snug text-slate-400">
        <span>{note}</span>
        {page && <span className="shrink-0">Page {page} of {pages}</span>}
      </p>
    </section>
  );
}

/** One attribute table, its totals last. */
export function AttributeTable({ table, size = 'text-[10px]', empty = 'None yet.' }) {
  return (
    <section aria-label={table.title} className="break-inside-avoid">
      <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-700">{table.title}</h3>
      {table.note && <p className="text-[9px] italic text-slate-500">{table.note}</p>}
      {table.rows.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">{empty}</p>
      ) : (
        <table className={`mt-1.5 w-full border-collapse border border-slate-300 ${size}`}>
          <thead className="bg-slate-100">
            <tr>
              {table.columns.map((column) => (
                <th key={column.key} scope="col"
                  className={`border-b border-slate-300 px-1.5 py-1 align-bottom font-semibold leading-tight text-slate-700 ${column.kind === 'text' ? 'text-left' : 'text-right'}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={`${row.name}-${i}`} className="odd:bg-white even:bg-slate-50">
                {table.columns.map((column, j) =>
                  j === 0 ? (
                    <th key={column.key} scope="row" className="border-b border-slate-200 px-1.5 py-0.5 text-left font-semibold text-slate-800">
                      {formatCell(row[column.key], column.kind)}
                    </th>
                  ) : (
                    <td key={column.key} className={`whitespace-nowrap border-b border-slate-200 px-1.5 py-0.5 text-slate-700 ${column.kind === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
                      {formatCell(row[column.key], column.kind)}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
          {table.totals && (
            <tfoot className="bg-slate-100 font-bold text-slate-800">
              <tr>
                {table.columns.map((column) => (
                  <td key={column.key} className={`px-1.5 py-1 ${column.kind === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
                    {table.totals[column.key] === undefined ? '' : formatCell(table.totals[column.key], column.kind)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </section>
  );
}

// A table's height on the page, in millimetres: its title and header, then a row each.
const ROW_MM = 5.3;
const tableMm = (table) => 14 + Math.max(1, table.rows.length + (table.totals ? 1 : 0)) * ROW_MM;

/**
 * The tables as pages, [{ tables, charts }]: each table on a page of its own,
 * except land cover and planting sites, which share one. A table's chart goes
 * under it when the page has room for it, and onto a page of its own — where
 * it fills the page — when the table is too long.
 *
 *   hasChart   whether a table has a chart (none, for the report's tables)
 *   pageMm     the height a page holds; headingMm, what the first page's heading takes
 */
export function tablePages(tables, { hasChart = () => false, pageMm = 172, headingMm = 28, chartMm = 65 } = {}) {
  const groups = [];
  for (const table of tables) {
    if (table.key === 'planting-sites' && groups.at(-1)?.[0]?.key === 'land-cover') groups.at(-1).push(table);
    else groups.push([table]);
  }
  const pages = [];
  for (const group of groups) {
    const charted = group.filter(hasChart);
    const room = pageMm - (pages.length === 0 ? headingMm : 0) - group.reduce((total, table) => total + tableMm(table), 0);
    if (charted.length === 0) pages.push({ tables: group, charts: [] });
    else if (room >= chartMm * charted.length) pages.push({ tables: group, charts: charted });
    else pages.push({ tables: group, charts: [] }, { tables: [], charts: charted });
  }
  return pages;
}

export const SOURCES_NOTE =
  'For planning purposes only. Not a land title, survey plan or proof of ownership. Sources: Green Tag tree inventory; ' +
  'PSA / NAMRIA boundaries; UP NOAH hazards; Copernicus DEM; DA–BSWM soils; DOST-PAGASA CLIRAM; DENR FMB Technical Bulletin No. 3.';
