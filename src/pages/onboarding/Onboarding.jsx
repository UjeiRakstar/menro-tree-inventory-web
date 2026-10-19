import { useRef, useState } from 'react';
import { Check, ImageUp, Loader2, LogOut } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { officeOf } from '../../lib/officeSettings.js';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import { officialName } from '../../lib/psgc.js';
import { roleLabel } from '../../lib/roles.js';
import BarangaySection from '../settings/BarangaySection.jsx';
import TreeInventorySection from '../settings/TreeInventorySection.jsx';
import { buttonClass, inputClass } from '../settings/Section.jsx';
import greenTagLogo from '../../assets/GreenTag_Logo.png';
import { LIMITS, shrinkImage } from '../../lib/shrinkImage.js';

const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const STEPS = ['Your details', 'Barangay population', 'Tree inventory'];

const DESIGNATIONS = [
  'MENRO',
  'CENRO',
  'Municipal Environment and Natural Resources Officer',
  'City Environment and Natural Resources Officer',
  'Environmental Management Specialist',
  'Forest Ranger',
  'Administrative Aide',
];

/** What the details step still needs, by field. */
export function detailProblems(form) {
  const problems = {};
  if (!form.full_name.trim()) problems.full_name = 'Your name is needed.';
  if (!form.designation.trim()) problems.designation = 'Your designation is needed.';
  if (!form.address.trim()) problems.address = 'An address is needed.';
  if (!form.avatar_url) problems.avatar_url = 'A photo is needed.';
  return problems;
}

/**
 * A new MENRO / CENRO account's first sign-in (supabase/onboarding.sql):
 *
 *   1. the holder's name, address, photo and designation — required;
 *   2. the barangays' population, PSA's 2024 count filled in — skippable;
 *   3. the office's existing tree inventory, in the standard spreadsheet —
 *      skippable.
 *
 * Both skippable steps are in Settings for later. Finishing marks the account
 * onboarded, and the dashboard opens.
 */
export default function Onboarding() {
  const { profile, lgu, refreshProfile } = useAuth();
  const lguInfo = MUNICIPALITY_LIST.find((item) => item.psgc === Number(profile?.lgu_psgc)) ?? null;
  const officeName = lguInfo ? officialName(lguInfo) : lgu?.label ?? '';
  const [form, setForm] = useState(() => ({
    full_name: profile?.full_name ?? '',
    designation: profile?.designation ?? '',
    address: profile?.address ?? '',
    avatar_url: profile?.avatar_url ?? '',
  }));
  // Details already saved — a reload part-way — start at the next step.
  const [step, setStep] = useState(() => (Object.keys(detailProblems(form)).length === 0 ? 1 : 0));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const picker = useRef(null);

  const problems = detailProblems(form);
  const shown = tried ? problems : {};
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function uploadPhoto(event) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    setBusy('photo');
    setProblem('');
    // Any size: resized here, so what is kept is the small one.
    let file;
    try {
      file = await shrinkImage(picked, LIMITS.photo);
    } catch (problem) {
      setBusy('');
      return setProblem(problem.message);
    }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${officeOf(profile)}/holder-${profile.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('office-logos').upload(path, file, { contentType: file.type, upsert: false });
    setBusy('');
    if (error) return setProblem(`The photo could not be uploaded: ${error.message}`);
    setForm((current) => ({ ...current, avatar_url: supabase.storage.from('office-logos').getPublicUrl(path).data.publicUrl }));
  }

  async function saveDetails(event) {
    event.preventDefault();
    setTried(true);
    setProblem('');
    if (Object.keys(problems).length > 0) return;
    setBusy('details');
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        designation: form.designation.trim(),
        address: form.address.trim(),
        avatar_url: form.avatar_url,
      })
      .eq('id', profile.id);
    setBusy('');
    if (error) return setProblem(error.message);
    setStep(1);
  }

  async function finish() {
    setBusy('finish');
    setProblem('');
    const { error } = await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', profile.id);
    if (error) {
      setBusy('');
      return setProblem(error.message);
    }
    await refreshProfile();
  }

  const nav = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
      <button type="button" onClick={() => setStep(step - 1)} className={`${buttonClass} text-slate-600 hover:bg-slate-100`}>Back</button>
      <div className="flex gap-2">
        <button type="button" disabled={Boolean(busy)} onClick={() => (step === 2 ? finish() : setStep(step + 1))}
          className={`${buttonClass} text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}>
          Skip for now
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => (step === 2 ? finish() : setStep(step + 1))}
          className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
          {busy === 'finish' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          {step === 2 ? 'Finish and open the dashboard' : 'Next'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-green-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center gap-3">
          <img src={greenTagLogo} alt="" className="h-12 w-12 object-contain" />
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-green-800">Green Tag</p>
            <h1 className="text-xl font-extrabold text-slate-900">Welcome to Green Tag, {roleLabel(profile?.role, { isCity: lguInfo?.isCity, short: true })}</h1>
            <p className="text-sm text-slate-600">{officeName}: three steps, and the last two can wait.</p>
          </div>
          <button type="button" onClick={() => supabase.auth.signOut()} className={`${buttonClass} text-slate-600 hover:bg-white`}>
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </header>

        <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Setting up the account">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold sm:text-sm ${i === step ? 'bg-green-700 text-white' : i < step ? 'bg-green-100 text-green-900' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${i === step ? 'bg-white text-green-800' : i < step ? 'bg-green-700 text-white' : 'bg-slate-100'}`}>
                {i < step ? <Check size={13} aria-hidden="true" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block">{label}</span>
                {i > 0 && <span className="hidden text-[11px] font-normal opacity-80 sm:block">optional</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {step === 0 && (
            <form onSubmit={saveDetails} className="space-y-5" aria-label="Your details" noValidate>
              <p className="text-sm text-slate-600">
                Who holds this account. Your name and designation go on the certificates and reports you sign; your photo is
                what PGENRO and your field team see.
              </p>
              <div className="flex flex-col gap-6 sm:flex-row">
                <div className="flex flex-col items-center gap-2">
                  <div className={`flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-2 ${shown.avatar_url ? 'ring-red-400' : 'ring-slate-200'}`}>
                    {form.avatar_url ? <img src={form.avatar_url} alt="Your photo" className="h-full w-full object-cover" /> : <ImageUp size={28} className="text-slate-400" aria-hidden="true" />}
                  </div>
                  <button type="button" onClick={() => picker.current?.click()} disabled={Boolean(busy)} className={`${buttonClass} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
                    {busy === 'photo' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                    {form.avatar_url ? 'Change photo' : 'Add a photo'}
                  </button>
                  <input ref={picker} type="file" accept={PHOTO_TYPES.join(',')} className="hidden" onChange={uploadPhoto} aria-label="Your photo" />
                  {shown.avatar_url && <p className="text-xs text-red-600">{shown.avatar_url}</p>}
                </div>
                <div className="grid flex-1 gap-4">
                  <label className="block text-sm font-semibold text-slate-700">
                    Full name
                    <input value={form.full_name} onChange={set('full_name')} autoComplete="name" className={inputClass} aria-invalid={Boolean(shown.full_name)} />
                    {shown.full_name && <span className="mt-1 block text-xs font-normal text-red-600">{shown.full_name}</span>}
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Designation
                    <input value={form.designation} onChange={set('designation')} list="designations" placeholder="e.g. MENRO" className={inputClass} aria-invalid={Boolean(shown.designation)} />
                    <datalist id="designations">{DESIGNATIONS.map((item) => <option key={item} value={item} />)}</datalist>
                    {shown.designation && <span className="mt-1 block text-xs font-normal text-red-600">{shown.designation}</span>}
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Address
                    <input value={form.address} onChange={set('address')} placeholder="e.g. Municipal Hall, Poblacion" className={inputClass} aria-invalid={Boolean(shown.address)} />
                    <span className="mt-1 block text-xs font-normal text-slate-500">Where the office can reach you. The office&apos;s address is enough.</span>
                    {shown.address && <span className="mt-1 block text-xs font-normal text-red-600">{shown.address}</span>}
                  </label>
                </div>
              </div>
              {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
              <div className="flex justify-end border-t border-slate-200 pt-4">
                <button type="submit" disabled={Boolean(busy)} className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
                  {busy === 'details' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                  Save and continue
                </button>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Each barangay&apos;s population, for the figures counted per person. PSA&apos;s 2024 count is already in each box:
                correct it where your office has a newer one, or keep it. You can change these later in Settings.
              </p>
              {lguInfo ? <BarangaySection lgu={lguInfo} defaultOpen /> : <p className="text-sm text-slate-500">This account has no LGU.</p>}
              {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
              {nav}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {lguInfo ? <TreeInventorySection lgu={lguInfo} bare /> : <p className="text-sm text-slate-500">This account has no LGU.</p>}
              <p className="text-xs text-slate-500">You can bring in an inventory later, from Settings → Tree inventory.</p>
              {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
              {nav}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
