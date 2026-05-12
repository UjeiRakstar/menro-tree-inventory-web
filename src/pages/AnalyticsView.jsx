import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { groupByBarangay, countBySpeciesType, countByTreeCategory, computePercentage } from '../lib/analyticsEngine.js';

/**
 * Analytics_Page — renders the /analytics route with Biodiversity Dashboard
 * and Carbon Sequestration & Stand Table panels.
 *
 * Owns the fetch-on-mount state machine that drives the two analytics panels,
 * loading indicator, and error alert. The actual panel content (progress bars,
 * multi-level table) will be layered in by tasks 4.2 and 4.3.
 *
 * State shape (discriminated by `status`):
 *   status        : 'loading' | 'error' | 'loaded'
 *   trees         : TreeRecord[]  — always defined, initially []
 *   errorMessage  : string        — always defined, '' outside 'error'
 *
 * Fetch contract: exactly one `supabase.from('trees').select('*')` on mount;
 * cancellation guard prevents state updates after unmount.
 */
export default function AnalyticsView() {
  const [status, setStatus] = useState('loading');
  const [trees, setTrees] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchTrees() {
      try {
        const { data, error } = await supabase.from('trees').select('*');
        if (cancelled) return;
        if (error) {
          setErrorMessage(error.message ?? 'Unknown Supabase error');
          setStatus('error');
          return;
        }
        setTrees(Array.isArray(data) ? data : []);
        setStatus('loaded');
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e?.message ?? 'Unexpected error loading analytics.');
        setStatus('error');
      }
    }

    fetchTrees();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
      </div>

      {status === 'loading' && (
        <div
          role="status"
          className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm"
        >
          Loading analytics…
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}

      {status === 'loaded' && (
        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-slate-900">
              Biodiversity Dashboard
            </h2>

            <div className="mt-4 space-y-4">
              <h3 className="text-lg font-medium text-slate-700">Species Type</h3>
              {(() => {
                const speciesCounts = countBySpeciesType(trees);
                const total = trees.length;
                return (
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-sm text-slate-600 mb-1">
                        <span>Endemic</span>
                        <span>{speciesCounts.Endemic}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded h-4">
                        <div
                          className="bg-green-500 h-4 rounded"
                          style={{ width: `${computePercentage(speciesCounts.Endemic, total)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm text-slate-600 mb-1">
                        <span>Invasive</span>
                        <span>{speciesCounts.Invasive}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded h-4">
                        <div
                          className="bg-red-500 h-4 rounded"
                          style={{ width: `${computePercentage(speciesCounts.Invasive, total)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              <h3 className="text-lg font-medium text-slate-700">Tree Category</h3>
              {(() => {
                const categoryCounts = countByTreeCategory(trees);
                const total = trees.length;
                return (
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-sm text-slate-600 mb-1">
                        <span>Fruit</span>
                        <span>{categoryCounts.Fruit}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded h-4">
                        <div
                          className="bg-amber-500 h-4 rounded"
                          style={{ width: `${computePercentage(categoryCounts.Fruit, total)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm text-slate-600 mb-1">
                        <span>Timber</span>
                        <span>{categoryCounts.Timber}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded h-4">
                        <div
                          className="bg-emerald-500 h-4 rounded"
                          style={{ width: `${computePercentage(categoryCounts.Timber, total)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm text-slate-600 mb-1">
                        <span>Ornamental</span>
                        <span>{categoryCounts.Ornamental}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded h-4">
                        <div
                          className="bg-purple-500 h-4 rounded"
                          style={{ width: `${computePercentage(categoryCounts.Ornamental, total)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              <button
                className="mt-4 px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800"
                onClick={() => console.log('Download Shapefile clicked')}
              >
                Download Shapefile
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900">
              Carbon Sequestration &amp; Stand Table
            </h2>

            <table className="mt-4 w-full border-collapse border border-slate-200 text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 px-3 py-2 text-left">Species</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">DBH</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">Carbon (kg)</th>
                </tr>
              </thead>
              <tbody>
                {groupByBarangay(trees).map((group) => (
                  <React.Fragment key={group.barangay}>
                    <tr className="bg-slate-50">
                      <td
                        colSpan={3}
                        className="border border-slate-200 px-3 py-2 font-semibold"
                      >
                        {group.barangay} &mdash; Total Carbon: {group.totalCarbon.toFixed(1)} kg
                      </td>
                    </tr>
                    {group.records.map((record, idx) => (
                      <tr key={idx}>
                        <td className="border border-slate-200 px-3 py-2">{record.species}</td>
                        <td className="border border-slate-200 px-3 py-2">{record.dbh}</td>
                        <td className="border border-slate-200 px-3 py-2">{record.carbon.toFixed(1)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <button
              className="mt-4 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              onClick={() => console.log('Download DENR Report clicked')}
            >
              Download DENR Report (PDF/Excel)
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
