import { Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { isPgenro } from '../../lib/roles.js';
import { officeOf } from '../../lib/officeSettings.js';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import { officialName } from '../../lib/psgc.js';
import { PROVINCE_LOGO, logoFor } from '../../lib/lguLogos.js';
import ProfileSection from './ProfileSection.jsx';
import BarangaySection from './BarangaySection.jsx';
import TeamSection from './TeamSection.jsx';
import DocumentsSection from './DocumentsSection.jsx';
import ImportSection from './ImportSection.jsx';
import TreeInventorySection from './TreeInventorySection.jsx';
import AiSection from './AiSection.jsx';
import PasswordSection from './PasswordSection.jsx';

/**
 * Everything an office sets up, in one place, from the seal's menu: its
 * profile and logos, its barangays' figures, its field team, the documents
 * behind its designated areas, areas brought in from files, its own AI key,
 * and its password. PGENRO gets the same, for PGENRO, without barangays.
 */
export default function Settings() {
  const { profile, lgu } = useAuth();
  const pgenro = isPgenro(profile);
  const office = officeOf(profile);
  const lguInfo = pgenro ? null : MUNICIPALITY_LIST.find((item) => item.psgc === Number(profile?.lgu_psgc)) ?? null;
  const officeLabel = pgenro
    ? 'PGENRO, Province of Laguna'
    : lguInfo
      ? officialName(lguInfo)
      : lgu?.label ?? '';

  if (!office) {
    return <p className="text-sm text-slate-600">Settings are for the MENRO / CENRO and PGENRO accounts.</p>;
  }
  const training = Boolean(profile?.is_training);

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <SettingsIcon size={24} className="text-green-700" aria-hidden="true" /> Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">{officeLabel}</p>
      </div>
      {training && (
        <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          This is a training account. The settings shown are the real office&apos;s, and a training account cannot change them.
        </p>
      )}
      <ProfileSection office={office} pgenro={pgenro} officeLabel={officeLabel} builtInSeal={pgenro ? PROVINCE_LOGO : logoFor(lguInfo?.name)} />
      {lguInfo && <BarangaySection lgu={lguInfo} />}
      <TeamSection pgenro={pgenro} />
      <DocumentsSection office={office} pgenro={pgenro} />
      {lguInfo && <TreeInventorySection lgu={lguInfo} />}
      <ImportSection lgu={lguInfo} />
      <AiSection office={office} pgenro={pgenro} />
      <PasswordSection />
    </section>
  );
}
