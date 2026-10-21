import { Building2 } from 'lucide-react';
import { MUNICIPALITY_LIST } from '../lib/lagunaBoundaries.js';
import { useActingLgu } from '../lib/actingLgu.js';

/**
 * "Working in": the super admin's choice between PGENRO's own view of a page
 * and one LGU's office's. Shown to the super admin only.
 *
 *   profile  the signed-in account's
 *   what     what the page is, for the sentence under the picker
 */
export default function ActingLguPicker({ profile, what = 'this page' }) {
  const { superAdmin, lgu, choose } = useActingLgu(profile);
  if (!superAdmin) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 ring-1 ring-violet-200">
      <Building2 size={18} className="text-violet-700" aria-hidden="true" />
      <label htmlFor="acting-lgu" className="text-sm font-semibold text-violet-900">
        Working in
      </label>
      <select
        id="acting-lgu"
        value={lgu?.psgc ?? ''}
        onChange={(event) => choose(Number(event.target.value) || null)}
        className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
      >
        <option value="">PGENRO (the province)</option>
        {MUNICIPALITY_LIST.map((item) => (
          <option key={item.psgc} value={item.psgc}>
            {item.label}
          </option>
        ))}
      </select>
      <p className="min-w-0 flex-1 text-xs text-violet-800">
        {lgu
          ? `As the super admin, you see and change ${what} as ${lgu.label}'s office does.`
          : `Choose an LGU to see and change ${what} as its office does.`}
      </p>
    </div>
  );
}
