import { useEffect, useRef, useState } from 'react';
import { ImageUp, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { isMissingTable, profileFields, profileForm, profileProblems, profileRow } from '../../lib/officeSettings.js';
import { forgetOfficeProfile } from '../../hooks/useOfficeProfile.js';
import Section, { Outcome, buttonClass, inputClass } from './Section.jsx';
import { LIMITS, shrinkImage } from '../../lib/shrinkImage.js';


/**
 * The office as its letterhead has it — names, address, contacts, the LGU's
 * seal and the office's own logo. What is saved here goes on the Certificate
 * of No Objection and the map sheets.
 */
export default function ProfileSection({ office, pgenro, officeLabel, builtInSeal }) {
  const [form, setForm] = useState(() => profileForm(null));
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [tried, setTried] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const pickers = { lgu_logo_url: useRef(null), office_logo_url: useRef(null) };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('office_profiles').select('*').eq('office', office).maybeSingle();
      if (cancelled) return;
      setMissing(isMissingTable(error));
      setForm(profileForm(error ? null : (Array.isArray(data) ? data[0] : data)));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [office]);

  const problems = profileProblems(form);
  const shown = tried ? problems : {};
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save() {
    setTried(true);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    setSaving(true);
    const { error } = await supabase.from('office_profiles').upsert(profileRow(office, form), { onConflict: 'office' });
    setSaving(false);
    forgetOfficeProfile(office);
    setOutcome(
      error
        ? { ok: false, text: isMissingTable(error) ? 'Settings need supabase/office_settings.sql, which has not been run yet.' : error.message }
        : { ok: true, text: 'Saved. Certificates and map sheets use it from now on.' }
    );
  }

  async function upload(key, picked) {
    if (!picked) return;
    setUploading(key);
    setOutcome(null);
    // Any size: resized here, so the stored logo — and any download of it —
    // is the small one (19 October).
    let file;
    try {
      file = await shrinkImage(picked, LIMITS.logo);
    } catch (problem) {
      setUploading('');
      setOutcome({ ok: false, text: problem.message });
      return;
    }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${office}/${key === 'lgu_logo_url' ? 'seal' : 'office'}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('office-logos').upload(path, file, { contentType: file.type, upsert: false });
    setUploading('');
    if (error) {
      setOutcome({
        ok: false,
        text: /bucket not found/i.test(error.message ?? '')
          ? 'Logos need supabase/office_settings.sql, which has not been run yet.'
          : `The picture could not be uploaded: ${error.message}`,
      });
      return;
    }
    const url = supabase.storage.from('office-logos').getPublicUrl(path).data.publicUrl;
    setForm((current) => ({ ...current, [key]: url }));
    setOutcome({ ok: true, text: 'Uploaded. Save changes to use it.' });
  }

  const logos = [
    { key: 'lgu_logo_url', label: pgenro ? 'Province seal' : 'LGU seal', fallback: builtInSeal },
    { key: 'office_logo_url', label: pgenro ? 'PGENRO logo' : 'MENRO / CENRO logo', fallback: null },
  ];

  return (
    <Section
      title={pgenro ? 'PGENRO profile' : 'LGU profile'}
      description={`${officeLabel} — as it appears on certificates and map sheets`}
      defaultOpen
    >
      {missing && (
        <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Settings need supabase/office_settings.sql, which has not been run yet.
        </p>
      )}
      {!loaded ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-4 sm:grid-cols-2">
            {profileFields(pgenro).map((field) => (
              <label key={field.key} className={`block text-sm font-semibold text-slate-700 ${field.wide ? 'sm:col-span-2' : ''}`}>
                {field.label}
                <input
                  type={field.kind === 'email' ? 'email' : field.kind === 'tel' ? 'tel' : 'text'}
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  onChange={set(field.key)}
                  className={inputClass}
                />
                {shown[field.key] && <span className="mt-1 block text-xs font-semibold text-red-700">{shown[field.key]}</span>}
              </label>
            ))}
          </div>

          <div className="flex gap-4 lg:flex-col">
            {logos.map((logo) => {
              const src = form[logo.key] || logo.fallback;
              return (
                <div key={logo.key} className="w-36 text-center">
                  <p className="text-xs font-semibold text-slate-600">{logo.label}</p>
                  <div className="mx-auto mt-1 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-slate-50 ring-1 ring-slate-200">
                    {src ? (
                      <img src={src} alt={logo.label} className="h-full w-full object-contain" />
                    ) : (
                      <span className="px-2 text-[11px] text-slate-400">None yet</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => pickers[logo.key].current?.click()}
                    disabled={Boolean(uploading)}
                    className={`${buttonClass} mt-2 w-full bg-white text-xs text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}
                  >
                    {uploading === logo.key ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <ImageUp size={13} aria-hidden="true" />}
                    Change
                  </button>
                  <input
                    ref={pickers[logo.key]}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    aria-label={`${logo.label} picture`}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      upload(logo.key, file);
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
            <button type="button" onClick={save} disabled={saving || missing} className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
              {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Save changes
            </button>
            <Outcome outcome={outcome} />
          </div>
        </div>
      )}
    </Section>
  );
}
