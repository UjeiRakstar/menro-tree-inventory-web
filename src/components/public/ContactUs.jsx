import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Facebook, Globe, Loader2, Mail, MapPin, Phone, Send } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { MUNICIPALITY_LIST } from '../../lib/lguOptions.js';
import { officialName } from '../../lib/psgc.js';
import { useAuthIfAny } from '../../context/AuthContext.jsx';

const PGENRO = { office: 'pgenro', name: 'PGENRO, Province of Laguna' };
/** Every office a visitor can write to: PGENRO first, then the 30 LGUs by name. */
export const CONTACT_OFFICES = [
  PGENRO,
  ...MUNICIPALITY_LIST.map((lgu) => ({ office: String(lgu.psgc), name: `${officialName(lgu)} — MENRO / CENRO` })),
];
const nameOf = (office) => CONTACT_OFFICES.find((entry) => entry.office === String(office))?.name ?? office;

/**
 * A request about one's own personal data in Green Tag (RA 10173): it goes to
 * PGENRO, which keeps the records, under its own subject (inbox.sql).
 */
export const PRIVACY_REQUEST = { office: 'privacy', name: 'PGENRO — data privacy request (your personal information in Green Tag)' };
const hasContact = (p) => Boolean(p?.email || p?.phone || p?.facebook_url || p?.website_url || p?.address_line1);
const href = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * Each office's contact details, as it keeps them in Settings
 * (office_profiles). An office that has filled none in is not listed.
 */
export function OfficeDirectory() {
  const [profiles, setProfiles] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('office_profiles').select('*');
      if (!cancelled) setProfiles(error || !Array.isArray(data) ? [] : data.filter(hasContact));
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const ordered = useMemo(
    () => (profiles ?? []).slice().sort((a, b) => (a.office === 'pgenro' ? -1 : b.office === 'pgenro' ? 1 : nameOf(a.office).localeCompare(nameOf(b.office)))),
    [profiles]
  );
  if (profiles === null || ordered.length === 0) return null;
  return (
    <section aria-label="The offices" className="mb-10">
      <h3 className="mb-4 text-lg font-bold text-green-900">The environment offices</h3>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((p) => (
          <li key={p.office} className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
            <p className="font-bold text-slate-900">{nameOf(p.office)}</p>
            {p.office_head && <p className="text-xs text-slate-500">{p.office_head}</p>}
            <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
              {(p.address_line1 || p.address_line2) && (
                <div className="flex gap-2">
                  <dt><MapPin size={15} className="mt-0.5 text-green-700" aria-label="Address" /></dt>
                  <dd>{[p.address_line1, p.address_line2].filter(Boolean).join(', ')}</dd>
                </div>
              )}
              {p.email && (
                <div className="flex gap-2">
                  <dt><Mail size={15} className="mt-0.5 text-green-700" aria-label="Email" /></dt>
                  <dd><a href={`mailto:${p.email}`} className="break-all text-green-800 underline">{p.email}</a></dd>
                </div>
              )}
              {p.phone && (
                <div className="flex gap-2">
                  <dt><Phone size={15} className="mt-0.5 text-green-700" aria-label="Phone" /></dt>
                  <dd><a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="text-green-800 underline">{p.phone}</a></dd>
                </div>
              )}
              {p.facebook_url && (
                <div className="flex gap-2">
                  <dt><Facebook size={15} className="mt-0.5 text-green-700" aria-label="Facebook" /></dt>
                  <dd><a href={href(p.facebook_url)} target="_blank" rel="noreferrer" className="break-all text-green-800 underline">Facebook page</a></dd>
                </div>
              )}
              {p.website_url && (
                <div className="flex gap-2">
                  <dt><Globe size={15} className="mt-0.5 text-green-700" aria-label="Website" /></dt>
                  <dd><a href={href(p.website_url)} target="_blank" rel="noreferrer" className="break-all text-green-800 underline">{p.website_url}</a></dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

const field =
  'w-full bg-[#1A8242] text-white px-6 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 ' +
  'focus:bg-[#167038] transition-colors text-sm font-semibold shadow-md placeholder:text-green-100/70';
const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-green-900';

/**
 * The contact form: the visitor chooses the office, and the message goes to
 * that office's inbox (send_contact_message() in supabase/inbox.sql). Only
 * that office reads it. A resident signed in with Google is replied to in
 * Green Tag, on the Community page; anyone else by email (replies.sql).
 */
export function ContactForm() {
  const auth = useAuthIfAny();
  // A resident who joined: the reply comes to their account.
  const resident = auth?.session && !auth.profile && auth.resident?.consented_at ? auth.resident : null;
  const [form, setForm] = useState(() => ({
    office: '',
    name: resident?.full_name ?? '',
    email: auth?.session?.user?.email ?? '',
    address: '',
    affiliation: '',
    message: '',
  }));
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function send(event) {
    event.preventDefault();
    setOutcome(null);
    if (!form.office) {
      setOutcome({ ok: false, text: 'Choose the office to send it to.' });
      return;
    }
    setSending(true);
    const privacy = form.office === PRIVACY_REQUEST.office;
    const params = {
      p_office: privacy ? 'pgenro' : form.office,
      p_name: form.name,
      p_email: form.email,
      p_address: form.address,
      p_affiliation: form.affiliation,
      p_message: form.message,
    };
    let { error } = await supabase.rpc('send_contact_message', privacy ? { ...params, p_topic: 'privacy' } : params);
    // A database not yet given the privacy topic: send it to PGENRO, marked in the message.
    if (error && privacy && /Could not find the function|p_topic/i.test(error.message ?? '')) {
      ({ error } = await supabase.rpc('send_contact_message', { ...params, p_message: `[Data privacy request] ${form.message}` }));
    }
    setSending(false);
    if (error) {
      setOutcome({
        ok: false,
        text: /Could not find the function|does not exist/i.test(error.message ?? '')
          ? 'Messages are not open yet. Please use the office’s email above for now.'
          : error.message,
      });
      return;
    }
    const to = privacy ? 'PGENRO, as a data privacy request' : nameOf(form.office);
    setOutcome({
      ok: true,
      text: resident
        ? `Sent to ${to}. The reply will be waiting for you on the Community page.`
        : `Sent to ${to}. They will reply to ${form.email}.`,
    });
    setForm((current) => ({ ...current, message: '' }));
  }

  return (
    <form onSubmit={send} aria-label="Send a message" className="space-y-4 sm:space-y-6">
      {resident && (
        <p role="note" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900 ring-1 ring-green-200">
          You are signed in with Google, so the office&apos;s reply will come to you here in Green Tag, on the Community page.
        </p>
      )}
      <div>
        <label htmlFor="contact-office" className={labelClass}>Send to<span className="ml-1 text-green-700" aria-hidden="true">*</span></label>
        <select id="contact-office" value={form.office} onChange={set('office')} required className={field}>
          <option value="">Choose the office…</option>
          {CONTACT_OFFICES.map((entry) => (
            <option key={entry.office} value={entry.office}>{entry.name}</option>
          ))}
          <option value={PRIVACY_REQUEST.office}>{PRIVACY_REQUEST.name}</option>
        </select>
        {form.office === PRIVACY_REQUEST.office && (
          <p className="mt-1 text-xs text-slate-600">
            To ask what Green Tag keeps about you, to see it, to correct it or to have it deleted. PGENRO answers it.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className={labelClass}>Full Name<span className="ml-1 text-green-700" aria-hidden="true">*</span></label>
          <input id="contact-name" value={form.name} onChange={set('name')} required autoComplete="name" className={field} />
        </div>
        <div>
          <label htmlFor="contact-email" className={labelClass}>Email Address<span className="ml-1 text-green-700" aria-hidden="true">*</span></label>
          <input id="contact-email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" className={field} />
        </div>
        <div>
          <label htmlFor="contact-address" className={labelClass}>Address</label>
          <input id="contact-address" value={form.address} onChange={set('address')} autoComplete="street-address" className={field} />
        </div>
        <div>
          <label htmlFor="contact-affiliation" className={labelClass}>Affiliation / Institution</label>
          <input id="contact-affiliation" value={form.affiliation} onChange={set('affiliation')} autoComplete="organization" className={field} />
        </div>
      </div>
      <div>
        <label htmlFor="contact-message" className={labelClass}>Message<span className="ml-1 text-green-700" aria-hidden="true">*</span></label>
        <textarea id="contact-message" rows={4} value={form.message} onChange={set('message')} required maxLength={4000} className={`${field} resize-none`} />
      </div>
      <p className="text-xs text-slate-600">
        Your name, email and message go only to the office you choose, so it can reply to you. They are not shown anywhere
        else.
      </p>
      <button type="submit" disabled={sending}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-green-700 px-6 py-4 text-lg font-bold uppercase tracking-widest text-white transition-all duration-300 hover:-translate-y-1 hover:bg-green-800 hover:shadow-xl focus:ring-4 focus:ring-green-500/50 disabled:opacity-60">
        {sending ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <Send size={20} aria-hidden="true" />}
        Send message
      </button>
      {outcome && (
        <p role={outcome.ok ? 'status' : 'alert'}
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${outcome.ok ? 'bg-green-100 text-green-900' : 'bg-red-50 text-red-700'}`}>
          {outcome.ok && <CheckCircle2 size={18} aria-hidden="true" />} {outcome.text}
        </p>
      )}
    </form>
  );
}
