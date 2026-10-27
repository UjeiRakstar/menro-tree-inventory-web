import { useRef, useState } from 'react';
import { ImageUp, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isPgenro } from '../../lib/roles.js';
import { DESIGNATIONS, PGENRO_DESIGNATIONS, PHOTO_TYPES, uploadHolderPhoto } from '../../lib/holderPhoto.js';
import Section, { Outcome, buttonClass, inputClass } from './Section.jsx';

/**
 * The person holding this account, not the office: their photo, name,
 * designation and address — set at onboarding, changed here. The office's own
 * name, logos and contact details are the Profile section's. Always the
 * signed-in person's, even while the super admin works in an LGU.
 *
 * A training account changes its name and designation, but not its photo:
 * photos are kept in the real office's folder, which the database keeps from
 * trainees (keeps_office()).
 */
export default function AccountSection({ defaultOpen = false }) {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState(() => ({
    full_name: profile?.full_name ?? '',
    designation: profile?.designation ?? '',
    address: profile?.address ?? '',
    avatar_url: profile?.avatar_url ?? '',
  }));
  const [busy, setBusy] = useState('');
  const [outcome, setOutcome] = useState(null);
  const picker = useRef(null);
  const training = Boolean(profile?.is_training);
  const designations = isPgenro(profile) ? PGENRO_DESIGNATIONS : DESIGNATIONS;
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function uploadPhoto(event) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    setBusy('photo');
    setOutcome(null);
    try {
      const avatar_url = await uploadHolderPhoto(profile, picked);
      setForm((current) => ({ ...current, avatar_url }));
      setOutcome({ ok: true, text: 'Photo ready — save to keep it.' });
    } catch (problem) {
      setOutcome({ ok: false, text: problem.message });
    } finally {
      setBusy('');
    }
  }

  async function save(event) {
    event.preventDefault();
    setOutcome(null);
    if (!form.full_name.trim()) return setOutcome({ ok: false, text: 'Your name is needed.' });
    if (!form.designation.trim()) return setOutcome({ ok: false, text: 'Your designation is needed.' });
    setBusy('save');
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        designation: form.designation.trim(),
        address: form.address.trim(),
        avatar_url: form.avatar_url || null,
      })
      .eq('id', profile.id);
    setBusy('');
    if (error) return setOutcome({ ok: false, text: error.message });
    await refreshProfile?.();
    setOutcome({ ok: true, text: 'Saved. Your name and photo show wherever you are signed in.' });
  }

  return (
    <Section title="Your account" description="Your own photo, name and designation — not the office’s" defaultOpen={defaultOpen}>
      <form onSubmit={save} aria-label="Your account" className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-2 ring-slate-200">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="Your photo" className="h-full w-full object-cover" />
            ) : (
              <ImageUp size={28} className="text-slate-400" aria-hidden="true" />
            )}
          </div>
          <button type="button" onClick={() => picker.current?.click()} disabled={busy === 'photo' || training}
            className={`${buttonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`}>
            {busy === 'photo' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {form.avatar_url ? 'Change photo' : 'Add a photo'}
          </button>
          <input ref={picker} type="file" accept={PHOTO_TYPES.join(',')} className="hidden" onChange={uploadPhoto} aria-label="Your photo" />
          {training && <p className="max-w-[10rem] text-center text-xs text-violet-800">A practice account keeps the photo it has.</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Full name
            <input value={form.full_name} onChange={set('full_name')} autoComplete="name" required className={inputClass} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Designation
            <input value={form.designation} onChange={set('designation')} list="account-designations" required className={inputClass} />
            <datalist id="account-designations">{designations.map((item) => <option key={item} value={item} />)}</datalist>
          </label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
            Address
            <input value={form.address} onChange={set('address')} placeholder="The office’s address is enough" className={inputClass} />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Signed in as <strong className="font-semibold text-slate-700">{profile?.email}</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={Boolean(busy)} className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
              {busy === 'save' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Save
            </button>
            <Outcome outcome={outcome} />
          </div>
        </div>
      </form>
    </Section>
  );
}
