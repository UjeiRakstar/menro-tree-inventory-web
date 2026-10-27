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
import ClimatePlanSection from './ClimatePlanSection.jsx';
import TreeInventorySection from './TreeInventorySection.jsx';
import AiSection from './AiSection.jsx';
import NicknameWordsSection from './NicknameWordsSection.jsx';
import PasswordSection from './PasswordSection.jsx';
import { TrainingLock } from './Section.jsx';
import ActingLguPicker from '../../components/ActingLguPicker.jsx';
import { useActingLgu } from '../../lib/actingLgu.js';

/**
 * Everything an office sets up, in one place, from the seal's menu: its
 * profile and logos, its barangays' figures, its field team, the documents
 * behind its designated areas, areas brought in from files, its own AI key,
 * and its password. PGENRO gets the same, for PGENRO, without barangays.
 *
 * The super admin can work in one LGU here (21 October): its profile,
 * barangays, team, documents, inventory and imports, as that LGU's office sees
 * them. Not its AI key, which only its own office sets, nor PGENRO's nickname
 * words; the password is always the super admin's own.
 */
export default function Settings() {
  const { profile, lgu } = useAuth();
  const { lgu: actingLgu } = useActingLgu(profile);
  const pgenro = isPgenro(profile) && !actingLgu;
  const office = actingLgu ? String(actingLgu.psgc) : officeOf(profile);
  const lguInfo = actingLgu ?? (isPgenro(profile) ? null : MUNICIPALITY_LIST.find((item) => item.psgc === Number(profile?.lgu_psgc)) ?? null);
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
      <ActingLguPicker profile={profile} what="its settings" />
      {training && (
        <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          This is a training account. The office&apos;s profile, barangay figures, documents, climate plan and AI key are the
          real office&apos;s: they can be seen here but not changed. Importing a tree inventory or areas works as practice.
        </p>
      )}
      {/* The real office's records: read-only for a training account. The
          tree inventory and imported areas are not here — a trainee's go
          behind the training wall, so they work as practice. */}
      <TrainingLock.Provider value={training}>
        <ProfileSection key={office} office={office} pgenro={pgenro} officeLabel={officeLabel} builtInSeal={pgenro ? PROVINCE_LOGO : logoFor(lguInfo?.name)} />
        {lguInfo && <BarangaySection key={lguInfo.psgc} lgu={lguInfo} />}
      </TrainingLock.Provider>
      <TeamSection pgenro={pgenro} lgu={actingLgu} />
      <TrainingLock.Provider value={training}>
        <DocumentsSection key={office} office={office} pgenro={pgenro} />
      </TrainingLock.Provider>
      {(lguInfo || pgenro) && <TreeInventorySection key={office} lgu={lguInfo} pgenro={pgenro} />}
      <ImportSection key={office} lgu={lguInfo} />
      <TrainingLock.Provider value={training}>
        {lguInfo && <ClimatePlanSection key={`plan-${lguInfo.psgc}`} lgu={lguInfo} />}
        {actingLgu ? (
          <p role="note" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            {actingLgu.label}&apos;s AI key is its office&apos;s own: only its MENRO / CENRO sets or removes it.
          </p>
        ) : (
          <AiSection office={office} pgenro={pgenro} />
        )}
      </TrainingLock.Provider>
      {pgenro && <NicknameWordsSection />}
      <PasswordSection />
    </section>
  );
}
