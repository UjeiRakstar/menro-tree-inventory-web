import { Download, Loader2, Printer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCell } from '../../lib/attributeTables.js';

/** One attribute table, its totals last. */
function AttributeTable({ table }) {
  return (
    <section aria-label={table.title} className="break-inside-avoid">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">{table.title}</h3>
      {table.rows.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">None yet.</p>
      ) : (
        <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-300 print:overflow-visible">
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-slate-100">
              <tr>
                {table.columns.map((column) => (
                  <th key={column.key} scope="col"
                    className={`border-b border-slate-300 px-2 py-1.5 font-semibold text-slate-700 ${column.kind === 'text' ? 'text-left' : 'text-right'}`}>
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
                      <th key={column.key} scope="row" className="border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-800">
                        {formatCell(row[column.key], column.kind)}
                      </th>
                    ) : (
                      <td key={column.key} className={`border-b border-slate-200 px-2 py-1 text-slate-700 ${column.kind === 'text' ? 'text-left' : 'text-right'}`}>
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
                    <td key={column.key} className={`px-2 py-1.5 ${column.kind === 'text' ? 'text-left' : 'text-right'}`}>
                      {table.totals[column.key] === undefined ? '' : formatCell(table.totals[column.key], column.kind)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * The attribute tables, as the DOST-PAGASA CLIRAM sheets lay out their
 * figures: the tables first, the charts under them.
 */
export default function TablesView({ heading, title, preparedBy, tables, chooseLgu = false, onExcel, exporting = false }) {
  const barangays = tables.find((table) => table.key === 'barangays');
  const cover = tables.find((table) => table.key === 'land-cover');
  const byClass = new Map();
  for (const row of cover?.rows ?? []) byClass.set(row.cover ?? 'Unclassified', (byClass.get(row.cover ?? 'Unclassified') ?? 0) + row.areaHa);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={onExcel} disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50">
          {exporting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
          Excel
        </button>
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
          <Printer size={15} aria-hidden="true" /> Print / PDF
        </button>
      </div>

      <article className="print-target space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="text-center">
          {heading.map((line, i) => (
            <p key={line} className={i === 0 ? 'text-sm font-bold text-slate-900' : 'text-xs text-slate-600'}>{line}</p>
          ))}
          <h2 className="mt-2 text-lg font-extrabold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">
            Attribute tables · prepared by {preparedBy} ·{' '}
            {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </header>

        {chooseLgu && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200 print:hidden">
            Choose a city or municipality in the Map tab for its barangays&apos; table.
          </p>
        )}
        {tables.map((table) => <AttributeTable key={table.key} table={table} />)}

        {/* The charts, under the tables */}
        <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
          {barangays?.rows?.some((row) => row.trees > 0) && (
            <section aria-label="Tagged trees by barangay" className="break-inside-avoid">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Tagged trees by barangay</h3>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barangays.rows.filter((row) => row.trees > 0)} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" angle={-40} textAnchor="end" interval={0} tick={{ fontSize: 9 }} height={50} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="native" name="Endemic / native" stackId="t" fill="#16a34a" isAnimationActive={false} />
                    <Bar dataKey="invasive" name="Invasive" stackId="t" fill="#dc2626" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
          {byClass.size > 0 && (
            <section aria-label="Land cover by class" className="break-inside-avoid">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Land cover by class (ha)</h3>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...byClass].map(([name, area]) => ({ name, area: Math.round(area * 100) / 100 }))} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 9 }} height={50} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="area" name="Hectares" fill="#15803d" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
        <p className="text-[10px] text-slate-400">
          For planning purposes only. Not a land title, survey plan or proof of ownership. Sources: Green Tag tree inventory;
          PSA / NAMRIA boundaries; UP NOAH; Copernicus DEM; DA–BSWM; DOST-PAGASA CLIRAM.
        </p>
      </article>
    </div>
  );
}
