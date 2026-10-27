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

/**
 * One attribute table, its totals last.
 *
 * Numbers stay on one line; text wraps. A table of long text (the CBI table's
 * "What the system shows" and "From") kept on one line ran off the side of
 * the page and squeezed the row labels to a word a line.
 */
export function AttributeTable({ table, size = 'text-[10px]', empty = 'None yet.', flow = false }) {
  // flow: printed in a flowing document (the report), a long table carries on
  // to the next page — its header row repeated, no row split, its title kept
  // with its first rows — instead of jumping whole to the next page.
  const totalsRow = table.totals ? (
    <tr className="break-inside-avoid bg-slate-100 font-bold text-slate-800">
      {table.columns.map((column) => (
        <td key={column.key} className={`px-1.5 py-1 ${column.kind === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
          {table.totals[column.key] === undefined ? '' : formatCell(table.totals[column.key], column.kind)}
        </td>
      ))}
    </tr>
  ) : null;
  return (
    <section aria-label={table.title} className={flow ? '' : 'break-inside-avoid'}>
      <h3 className="break-after-avoid text-[12px] font-bold uppercase tracking-wider text-slate-700">{table.title}</h3>
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
              <tr key={`${row.name}-${i}`} className="break-inside-avoid odd:bg-white even:bg-slate-50">
                {table.columns.map((column, j) =>
                  j === 0 ? (
                    <th key={column.key} scope="row" className="min-w-[24mm] border-b border-slate-200 px-1.5 py-0.5 text-left align-top font-semibold text-slate-800">
                      {formatCell(row[column.key], column.kind)}
                    </th>
                  ) : (
                    <td key={column.key} className={`border-b border-slate-200 px-1.5 py-0.5 align-top text-slate-700 ${column.kind === 'text' ? 'text-left' :'whitespace-nowrap text-right tabular-nums'}`}>
                      {formatCell(row[column.key], column.kind)}
                    </td>
                  )
                )}
              </tr>
            ))}
            {/* Flowing, the totals are the last row, printed once: a <tfoot>
                is repeated at the foot of every page the table runs over. */}
            {flow && totalsRow}
          </tbody>
          {!flow && table.totals && <tfoot>{totalsRow}</tfoot>}
        </table>
      )}
    </section>
  );
}

// A table's height on the page, in millimetres: its title, note and header, then a row each.
const tableMm = (table, rowMm) => 16 + (table.note ? 4 : 0) + Math.max(1, table.rows.length + (table.totals ? 1 : 0)) * rowMm;

/**
 * The tables as pages, each { items: [{ kind: 'table' | 'chart', table }],
 * tables, charts }: a table with its chart under it, as many to a page as
 * fit — short tables share a page rather than leave most of it blank — and
 * a table too long to leave room for its chart has the chart on the next page.
 * A chart grows into whatever room its page has left, up to the cap its view
 * sets, so the page is filled without a short table's chart turning huge.
 *
 *   hasChart   whether a table has a chart (none, for the report's tables)
 *   pageMm     the height a page holds; headingMm, what the first page's heading takes
 *   chartMm    the least a chart needs; rowMm, a table row's height
 */
export function tablePages(tables, { hasChart = () => false, pageMm = 172, headingMm = 28, chartMm = 65, rowMm = 5.3 } = {}) {
  const pages = [];
  let current = null;
  let room = 0;
  const open = () => {
    current = { items: [] };
    pages.push(current);
    room = pageMm - (pages.length === 1 ? headingMm : 0);
  };
  for (const table of tables) {
    const tableHeight = tableMm(table, rowMm);
    const chartHeight = hasChart(table) ? chartMm : 0;
    if (!current || (current.items.length > 0 && tableHeight + chartHeight > room)) open();
    current.items.push({ kind: 'table', table });
    room -= tableHeight;
    if (!chartHeight) continue;
    if (chartHeight > room) {
      open();
      current.items.push({ kind: 'chart', table });
      room -= chartHeight;
      // A chart alone on a page takes the page.
      current = null;
    } else {
      current.items.push({ kind: 'chart', table });
      room -= chartHeight;
    }
  }
  return pages.map((page) => ({
    ...page,
    tables: page.items.filter((item) => item.kind === 'table').map((item) => item.table),
    charts: page.items.filter((item) => item.kind === 'chart').map((item) => item.table),
  }));
}

export const SOURCES_NOTE =
  'For planning purposes only. Not a land title, survey plan or proof of ownership. Sources: Green Tag tree inventory; ' +
  'PSA / NAMRIA boundaries; UP NOAH hazards; Copernicus DEM; DA–BSWM soils; DOST-PAGASA CLIRAM; DENR FMB Technical Bulletin No. 3.';
