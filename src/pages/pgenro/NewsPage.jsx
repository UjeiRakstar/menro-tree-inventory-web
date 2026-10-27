import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, CalendarDays, ClipboardPaste, Forward, ImagePlus, List, Loader2, MapPin, Megaphone, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { useAuthIfAny } from '../../context/AuthContext.jsx';
import { ROLES, roleOf } from '../../lib/roles.js';
import { boundsOf } from '../../lib/lagunaBoundaries.js';
import { centroidOf } from '../../lib/areaGeometry.js';
import {
  CBI_CREDITS,
  EVENT_KINDS,
  PURPOSE_OF_KIND,
  MAX_NEWS_PHOTOS,
  NEWS_BUCKET,
  newsProblems,
  newsStatus,
  partnerList,
  photoPaths,
  publishDueNews,
  publishTimeOf,
  publishedWhen,
  toLocalInput,
  uploadNewsPhotos,
  whenAndWhere,
} from '../../lib/news.js';
import NewsCalendar from './NewsCalendar.jsx';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';

const PinPicker = lazy(() => import('../../components/map/PinPicker.jsx'));

// The event (21 October): a first day, then a last day or "one day only"; its
// kind; the LGU it is for (blank: all of Laguna); and its purpose, which is
// what it counts for in the CBI. Where (22 October): the venue pinned on the
// map, and the planting site an event is made from.
const EMPTY = {
  title: '', event_date: '', event_end_date: '', one_day: true, event_kind: '', lgu_psgc: '', cbi_credit: '', partners: '',
  venue: '', pin: null, map_area_id: null, body: '', when: 'now', publish_at: '',
};
/** The form's dates as the post keeps them: a one-day event has no last day. */
const eventDates = (form) => ({ ...form, event_end_date: form.one_day ? '' : form.event_end_date });
/** PostgREST's "no such column": inbox.sql has not been run again since 21 October. */
const needsEventColumns = (message) => /event_end_date|event_kind|cbi_credit|lgu_psgc|venue_lat|venue_lng|map_area_id/.test(message ?? '');
const pinText = ([lat, lng]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
const FILTERS = [
  ['all', 'All'],
  ['scheduled', 'Scheduled'],
  ['published', 'Published'],
  ['archived', 'Archived'],
];
const STATUS_BADGE = {
  scheduled: 'bg-white text-green-800 ring-1 ring-green-400 border-dashed',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-slate-200 text-slate-600',
};
/** PostgREST's "no such column": inbox.sql not run again since scheduling came in. */
const isMissingColumn = (error) =>
  error?.code === '42703' || error?.code === 'PGRST204' || /column .* does not exist|Could not find the '/i.test(error?.message ?? '');
const NEEDS_RERUN = 'Scheduling and archiving need supabase/inbox.sql to be run again.';
/** The partners column comes with cbi_ubi.sql (step 38). */
const NEEDS_PARTNERS = 'Naming partners needs supabase/cbi_ubi.sql to be run (step 38).';
const missingWhich = (error) => (/partners/.test(error?.message ?? '') ? NEEDS_PARTNERS : NEEDS_RERUN);
const input = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none';

/** The images among pasted or dropped items, named so a pasted one has a name too. */
function imagesOf(items) {
  return Array.from(items ?? [])
    .map((item) => (item instanceof File ? item : item.kind === 'file' ? item.getAsFile() : null))
    .filter((file) => file && file.type.startsWith('image/'))
    .map((file, i) =>
      file.name && file.name !== 'image.png'
        ? file
        : new File([file], `pasted-${Date.now()}-${i + 1}.${file.type.split('/')[1] || 'png'}`, { type: file.type })
    );
}

/**
 * PGENRO's News & Events. A post is sent to every MENRO / CENRO's inbox as a
 * newsletter when it is published (supabase/inbox.sql), and shown on the
 * home page. It is published at once, or scheduled for a day and time; it can
 * be archived — off the home page, kept here — and restored. The calendar
 * lays the month's posts out by the day each goes public (19 October). A post can be edited after it is published — the home page shows
 * the change; the newsletter already sent is not sent again. Deleting it takes
 * it off the home page; the copies in the offices' inboxes are theirs to delete.
 *
 * Photos come from a file, a drag onto the photos, or a paste — a photo copied
 * from anywhere, pasted with Ctrl+V while this page is open.
 */
export default function NewsPage() {
  // A MENRO / CENRO posts its own LGU's events; PGENRO posts for everyone.
  const profile = useAuthIfAny()?.profile ?? null;
  const ownLgu =
    roleOf(profile) === ROLES.LGU_ADMIN ? MUNICIPALITY_LIST.find((lgu) => lgu.psgc === Number(profile?.lgu_psgc)) ?? null : null;
  const office = Boolean(ownLgu);
  const blank = useMemo(() => (ownLgu ? { ...EMPTY, lgu_psgc: String(ownLgu.psgc), event_kind: 'other' } : EMPTY), [ownLgu]);
  const [posts, setPosts] = useState(null);
  const [form, setForm] = useState(blank);
  const [pinning, setPinning] = useState(false);
  // Opened from a planting site on the map: its bounds, to open the pin map on it.
  const [focus, setFocus] = useState(null);
  // Editing a post: its photos already online, kept until removed.
  const [editing, setEditing] = useState(null);
  const [kept, setKept] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [view, setView] = useState('list');
  const [filter, setFilter] = useState('all');
  const [month, setMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const fileInput = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Anything whose time has come goes out first.
      await publishDueNews();
      const { data, error } = await supabase.from('news_posts').select('*').order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) setOutcome({ ok: false, text: /does not exist|Could not find the table/i.test(error.message) ? 'News & Events needs supabase/inbox.sql, which has not been run yet.' : error.message });
      const all = Array.isArray(data) ? data : [];
      // An office keeps its own here; the rest are on the home page.
      setPosts(office ? all.filter((post) => post.created_by === profile?.id) : all);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [office]);

  // "Create an event here", from a planting site PGENRO designated: a tree
  // planting on that site, pinned at its middle (/news?area=…).
  useEffect(() => {
    const areaId = new URLSearchParams(window.location.search).get('area');
    if (!areaId) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('map_areas')
        .select('id, name, barangay, municipality, geometry, kind')
        .eq('id', areaId)
        .maybeSingle();
      if (cancelled || !data || Array.isArray(data)) return;
      const lgu = MUNICIPALITY_LIST.find((item) => item.name === data.municipality);
      if (ownLgu && lgu?.psgc !== ownLgu.psgc) return;
      const middle = data.geometry ? centroidOf(data.geometry) : null;
      setForm({
        ...blank,
        title: `Tree planting at ${data.name}`,
        event_kind: 'tree-planting',
        one_day: true,
        lgu_psgc: lgu ? String(lgu.psgc) : blank.lgu_psgc,
        cbi_credit: PURPOSE_OF_KIND['tree-planting'],
        venue: [data.name, data.barangay].filter(Boolean).join(', '),
        pin: middle,
        map_area_id: data.id,
      });
      setFocus(data.geometry ? boundsOf(data.geometry) : null);
      window.history.replaceState(window.history.state, '', window.location.pathname);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const room = MAX_NEWS_PHOTOS - kept.length;
  const addPhotos = (files) => {
    if (files.length === 0) return;
    setPhotos((current) => [...current, ...files].slice(0, Math.max(0, room) + 1));
  };

  // A photo copied from anywhere, pasted while the page is open.
  useEffect(() => {
    const onPaste = (event) => {
      const files = imagesOf(event.clipboardData?.items);
      if (files.length === 0) return;
      event.preventDefault();
      addPhotos(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // addPhotos reads the room left, which changes with kept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kept.length]);

  // Previews of the photos not yet uploaded.
  const previews = useMemo(() => photos.map((file) => ({ file, url: URL.createObjectURL(file) })), [photos]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const problems = newsProblems(eventDates(form), photos);
  // An office posts events, each with its day.
  if (office && !form.event_date) problems.event_date = 'Give the day of the event.';
  if (!problems.photos && kept.length + photos.length > MAX_NEWS_PHOTOS) problems.photos = `At most ${MAX_NEWS_PHOTOS} photos.`;
  // A published post stays published; a new or scheduled one can be scheduled.
  const canSchedule = !editing || newsStatus(editing) === 'scheduled';
  if (canSchedule && form.when === 'schedule') {
    const at = Date.parse(form.publish_at);
    if (!Number.isFinite(at)) problems.publish_at = 'Choose the day and time it goes out.';
    else if (at <= Date.now()) problems.publish_at = 'That time has passed: choose a later one, or publish it now.';
  }
  const shown = tried ? problems : {};
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function startEdit(item) {
    setEditing(item);
    const scheduled = newsStatus(item) === 'scheduled';
    setForm({
      title: item.title ?? '',
      event_date: item.event_date ?? '',
      event_end_date: item.event_end_date ?? '',
      one_day: !item.event_end_date || item.event_end_date === item.event_date,
      event_kind: item.event_kind ?? '',
      lgu_psgc: item.lgu_psgc ? String(item.lgu_psgc) : '',
      cbi_credit: item.cbi_credit ?? '',
      partners: partnerList(item.partners).join(', '),
      venue: item.venue ?? '',
      pin: Number.isFinite(item.venue_lat) && Number.isFinite(item.venue_lng) ? [item.venue_lat, item.venue_lng] : null,
      map_area_id: item.map_area_id ?? null,
      body: item.body ?? '',
      when: scheduled ? 'schedule' : 'now',
      publish_at: scheduled ? toLocalInput(item.publish_at) : '',
    });
    setKept(Array.isArray(item.photos) ? item.photos : []);
    setPhotos([]);
    setTried(false);
    setOutcome(null);
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  /** A new post scheduled for a day of the calendar, at eight in the morning. */
  function startOn(day) {
    stopEdit();
    const at = new Date(`${day}T08:00`);
    setForm({ ...blank, when: at > new Date() ? 'schedule' : 'now', publish_at: at > new Date() ? `${day}T08:00` : '' });
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function stopEdit() {
    setEditing(null);
    setForm(blank);
    setFocus(null);
    setPinning(false);
    setKept([]);
    setPhotos([]);
    setTried(false);
  }

  async function save(event) {
    event.preventDefault();
    setTried(true);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    setSaving(true);
    let uploaded = [];
    try {
      uploaded = await uploadNewsPhotos(photos);
      const row = {
        title: form.title.trim(),
        body: form.body.trim(),
        venue: form.venue.trim() || null,
        event_date: form.event_date || null,
        // Sent when filled, or to clear what a post had: a post without them
        // still saves before inbox.sql is run again (step 28).
        ...Object.fromEntries(
          Object.entries({
            event_end_date: (!form.one_day && form.event_end_date) || null,
            event_kind: form.event_kind || null,
            lgu_psgc: form.lgu_psgc ? Number(form.lgu_psgc) : null,
            cbi_credit: form.cbi_credit || null,
            venue_lat: form.pin ? form.pin[0] : null,
            venue_lng: form.pin ? form.pin[1] : null,
            map_area_id: form.map_area_id || null,
          }).filter(([key, value]) => value !== null || (editing && key in editing))
        ),
        photos: [...kept, ...uploaded],
      };
      // Its partners (Indicator 24), sent when there are any or to clear
      // them: a post saves before cbi_ubi.sql is run, as long as none is named.
      const partners = partnerList(form.partners);
      if (partners.length || partnerList(editing?.partners).length) row.partners = partners;
      // When it goes out: a time chosen, or now for a post still waiting.
      const scheduling = canSchedule && form.when === 'schedule';
      if (scheduling) row.publish_at = new Date(form.publish_at).toISOString();
      else if (editing && newsStatus(editing) === 'scheduled') row.publish_at = new Date().toISOString();
      if (editing) {
        const { data, error } = await supabase.from('news_posts').update(row).eq('id', editing.id).select().single();
        if (error) throw new Error(isMissingColumn(error) ? missingWhich(error) : error.message);
        // Photos taken off the post come off storage too, once the post no longer shows them.
        const dropped = photoPaths((editing.photos ?? []).filter((url) => !kept.includes(url)));
        if (dropped.length) await supabase.storage.from(NEWS_BUCKET).remove(dropped);
        setPosts((current) => current.map((p) => (p.id === editing.id ? { ...p, ...row, ...(data ?? {}) } : p)));
        setOutcome({
          ok: true,
          text: scheduling
            ? `Saved. ${publishedWhen({ ...row })}.`
            : newsStatus(editing) !== 'scheduled'
              ? 'Saved. The home page shows the change; the newsletter already sent is not sent again.'
              : office
                ? 'Saved, and published: PGENRO has it in its inbox, and it is on the home page.'
                : 'Saved, and published: every MENRO / CENRO has it in their inbox, and it is on the home page.',
        });
      } else {
        const { data, error } = await supabase.from('news_posts').insert(row).select().single();
        if (error) throw new Error(isMissingColumn(error) ? missingWhich(error) : error.message);
        setPosts((current) => [data ?? { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...(current ?? [])]);
        setOutcome({
          ok: true,
          text: scheduling
            ? `${publishedWhen({ ...row })}. It goes to ${office ? 'PGENRO' : 'every MENRO / CENRO'} and onto the home page then.`
            : office
              ? 'Posted. PGENRO has it in its inbox, and it is on the home page.'
              : 'Posted. Every MENRO / CENRO has it in their inbox, and it is on the home page.',
        });
      }
      setEditing(null);
      setForm(blank);
      setFocus(null);
      setPinning(false);
      setKept([]);
      setPhotos([]);
      setTried(false);
    } catch (failure) {
      if (uploaded.length) await supabase.storage.from(NEWS_BUCKET).remove(photoPaths(uploaded));
      setOutcome({
        ok: false,
        text: needsEventColumns(failure.message)
          ? 'The event’s days, kind, purpose and map pin need supabase/inbox.sql to be run again (step 31).'
          : `${editing ? 'Not saved' : 'Not posted'}: ${failure.message}`,
      });
    } finally {
      setSaving(false);
    }
  }

  /** Off the home page and kept, or back on it. */
  async function setArchived(item, archived) {
    const archived_at = archived ? new Date().toISOString() : null;
    const { error } = await supabase.from('news_posts').update({ archived_at }).eq('id', item.id);
    if (error) {
      setOutcome({ ok: false, text: isMissingColumn(error) ? missingWhich(error) : error.message });
      return;
    }
    setPosts((current) => current.map((p) => (p.id === item.id ? { ...p, archived_at } : p)));
    setOutcome({
      ok: true,
      text: archived
        ? `"${item.title}" archived: off the home page, kept here.`
        : `"${item.title}" restored${newsStatus({ ...item, archived_at: null }) === 'scheduled' ? ', still scheduled' : ' to the home page'}.`,
    });
  }

  /**
   * An office's event, passed on to every other MENRO / CENRO (22 October):
   * it went to PGENRO and its own office only (inbox.sql).
   */
  async function forward(item) {
    const from = MUNICIPALITY_LIST.find((lgu) => lgu.psgc === Number(item.lgu_psgc))?.label ?? 'the office';
    if (!window.confirm(`Send "${item.title}" to every other MENRO / CENRO? It came from ${from}.`)) return;
    const { error } = await supabase.rpc('forward_news_post', { p_id: item.id });
    if (error) {
      setOutcome({ ok: false, text: /forward_news_post|Could not find the function/i.test(error.message ?? '') ? 'Passing an event on needs supabase/inbox.sql to be run again (step 32).' : error.message });
      return;
    }
    const at = new Date().toISOString();
    setPosts((current) => current.map((p) => (p.id === item.id ? { ...p, forwarded_at: at } : p)));
    setOutcome({ ok: true, text: `"${item.title}" sent to every other MENRO / CENRO.` });
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}"? It comes off the home page. The copies in the offices' inboxes stay theirs.`)) return;
    const { error } = await supabase.from('news_posts').delete().eq('id', item.id);
    if (error) {
      setOutcome({ ok: false, text: error.message });
      return;
    }
    const paths = photoPaths(item.photos ?? []);
    if (paths.length) await supabase.storage.from(NEWS_BUCKET).remove(paths);
    setPosts((current) => current.filter((p) => p.id !== item.id));
    if (editing?.id === item.id) stopEdit();
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Megaphone size={24} className="text-green-700" aria-hidden="true" /> News &amp; Events
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {office
            ? `${ownLgu.label}’s events: each goes onto the home page and to PGENRO’s inbox — now, or at the time you schedule. Archive one to take it off the home page and keep it.`
            : 'Each post goes to every MENRO / CENRO’s inbox as a newsletter, and onto the home page — now, or at the time you schedule. Archive one to take it off the home page and keep it.'}
        </p>
      </div>

      <form ref={formRef} onSubmit={save} noValidate aria-label={editing ? 'Edit the post' : 'New post'}
        className={`space-y-3 rounded-2xl border bg-white p-5 shadow-sm ${editing ? 'border-amber-300' : 'border-slate-200'}`}>
        {editing && (
          <p className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>Editing &ldquo;{editing.title}&rdquo;</span>
            <button type="button" onClick={stopEdit} className="font-semibold underline">Cancel</button>
          </p>
        )}
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Title</span>
          <input value={form.title} onChange={set('title')} className={input} aria-invalid={Boolean(shown.title)} />
          {shown.title && <span className="mt-1 block text-xs text-red-700">{shown.title}</span>}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Kind of event</span>
            <select
              value={form.event_kind}
              onChange={(event) => {
                const kind = EVENT_KINDS.find((k) => k.id === event.target.value);
                // A tree planting is usually one day; a training may run longer.
                // Its usual purpose comes with it, unless one was chosen.
                setForm((current) => ({
                  ...current,
                  event_kind: event.target.value,
                  one_day: kind ? kind.oneDay : current.one_day,
                  cbi_credit:
                    !current.cbi_credit || current.cbi_credit === PURPOSE_OF_KIND[current.event_kind]
                      ? PURPOSE_OF_KIND[event.target.value] ?? ''
                      : current.cbi_credit,
                }));
              }}
              className={input}
            >
              {!office && <option value="">Not an event (news)</option>}
              {EVENT_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Held for</span>
            <select value={form.lgu_psgc} onChange={set('lgu_psgc')} className={input} disabled={office}>
              {!office && <option value="">All of Laguna</option>}
              {MUNICIPALITY_LIST.map((lgu) => <option key={lgu.psgc} value={lgu.psgc}>{lgu.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">{form.one_day ? 'Date' : 'First day'}</span>
            <input type="date" value={form.event_date} onChange={set('event_date')} className={input} aria-invalid={Boolean(shown.event_date)} />
            {shown.event_date && <span className="mt-1 block text-xs text-red-700">{shown.event_date}</span>}
          </label>
          <div className="text-sm">
            <label className="flex items-center gap-2 font-semibold text-slate-700">
              <input type="checkbox" checked={form.one_day} onChange={(event) => setForm((current) => ({ ...current, one_day: event.target.checked }))} />
              One day only (the whole day)
            </label>
            {!form.one_day && (
              <label className="mt-1 block">
                <input type="date" value={form.event_end_date} min={form.event_date || undefined} onChange={set('event_end_date')}
                  aria-label="Last day" aria-invalid={Boolean(shown.event_end_date)} className={input} />
                <span className="mt-0.5 block text-xs text-slate-500">Last day</span>
                {shown.event_end_date && <span className="mt-1 block text-xs text-red-700">{shown.event_end_date}</span>}
              </label>
            )}
          </div>
          <div className="text-sm">
            <label className="block">
              <span className="font-semibold text-slate-700">Venue</span>
              <input value={form.venue} onChange={set('venue')} className={input} />
            </label>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              {form.pin ? (
                <>
                  <span className="inline-flex items-center gap-1 font-semibold text-green-800">
                    <MapPin size={12} aria-hidden="true" /> Pinned at {pinText(form.pin)}
                  </span>
                  <button type="button" onClick={() => setForm((c) => ({ ...c, pin: null }))} className="underline">
                    Remove the pin
                  </button>
                </>
              ) : (
                <span>Not pinned on the map.</span>
              )}
              <button type="button" onClick={() => setPinning((open) => !open)} aria-expanded={pinning}
                className="font-semibold text-green-800 underline">
                {pinning ? 'Close the map' : form.pin ? 'Move it on the map' : 'Pin it on the map'}
              </button>
            </p>
            {form.map_area_id && (
              <p className="mt-0.5 text-xs text-slate-500">Held on a tree planting site PGENRO designated.</p>
            )}
          </div>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Purpose</span>
            <select value={form.cbi_credit} onChange={set('cbi_credit')} className={input}>
              <option value="">None of these</option>
              {CBI_CREDITS.map((credit) => <option key={credit.id} value={credit.id}>{credit.label}</option>)}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-semibold text-slate-700">Partners</span>
            <input value={form.partners} onChange={set('partners')} placeholder="e.g. LSPU, Haribon Foundation, NGCP" className={input} />
            <span className="mt-0.5 block text-xs text-slate-500">
              Optional. The companies, NGOs, schools and international organisations it was held with, separated by commas.
            </span>
          </label>
        </div>
        {pinning && (
          <Suspense fallback={<p className="text-xs text-slate-500">Loading the map…</p>}>
            <PinPicker
              key={`${form.lgu_psgc}-${focus ? 'site' : 'lgu'}`}
              municipality={form.lgu_psgc ? MUNICIPALITY_LIST.find((lgu) => String(lgu.psgc) === form.lgu_psgc)?.name : null}
              focus={focus}
              value={form.pin}
              onChange={(point) => setForm((c) => ({ ...c, pin: point }))}
              placeLabel="venue"
              verb="is"
            />
          </Suspense>
        )}
        {canSchedule ? (
          <fieldset className="rounded-xl bg-slate-50 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-700">When it goes out</legend>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="when" checked={form.when === 'now'} onChange={() => setForm((c) => ({ ...c, when: 'now' }))} />
                Now
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="when" checked={form.when === 'schedule'} onChange={() => setForm((c) => ({ ...c, when: 'schedule' }))} />
                Schedule
              </label>
              {form.when === 'schedule' && (
                <label className="flex items-center gap-2">
                  <span className="sr-only">Goes out on</span>
                  <input type="datetime-local" value={form.publish_at} onChange={set('publish_at')} min={toLocalInput(new Date())}
                    aria-label="Goes out on" aria-invalid={Boolean(shown.publish_at)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              A scheduled post waits here, on the calendar, and goes to every office&apos;s inbox and onto the home page at its time.
            </p>
            {shown.publish_at && <span className="mt-1 block text-xs text-red-700">{shown.publish_at}</span>}
          </fieldset>
        ) : (
          <p className="text-xs text-slate-500">{publishedWhen(editing)}. Its newsletter has gone out; changes show on the home page.</p>
        )}
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Description</span>
          <textarea rows={5} value={form.body} onChange={set('body')} className={`${input} resize-y`} />
        </label>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addPhotos(imagesOf(event.dataTransfer?.files));
          }}
          className={`rounded-xl border-2 border-dashed p-3 ${dragging ? 'border-green-500 bg-green-50' : 'border-slate-200'}`}
        >
          <span className="text-sm font-semibold text-slate-700">Photos</span>
          <p className="text-xs text-slate-500">
            Up to {MAX_NEWS_PHOTOS}. Choose a file, drag one here, or copy a photo anywhere and paste it with Ctrl+V. With
            two or more, the home page turns through them.
          </p>
          <ul aria-label="The post's photos" className="mt-2 flex flex-wrap gap-2">
            {kept.map((url) => (
              <li key={url} className="relative">
                <img src={url} alt="" className="h-20 w-28 rounded-lg object-cover ring-1 ring-slate-200" />
                <button type="button" onClick={() => setKept((current) => current.filter((u) => u !== url))} aria-label="Remove this photo"
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-700 shadow">
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
            {previews.map(({ file, url }, i) => (
              <li key={url} className="relative">
                <img src={url} alt={file.name} className="h-20 w-28 rounded-lg object-cover ring-1 ring-green-300" />
                <button type="button" onClick={() => setPhotos((current) => current.filter((_, j) => j !== i))} aria-label={`Remove ${file.name}`}
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-700 shadow">
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
            {kept.length + photos.length < MAX_NEWS_PHOTOS && (
              <li className="flex flex-col gap-1">
                <button type="button" onClick={() => fileInput.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
                  <ImagePlus size={13} aria-hidden="true" /> Add a photo
                </button>
                <span className="inline-flex items-center gap-1 px-2 text-[11px] text-slate-500">
                  <ClipboardPaste size={12} aria-hidden="true" /> or paste one
                </span>
              </li>
            )}
          </ul>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple
            onChange={(event) => {
              addPhotos(imagesOf(event.target.files));
              event.target.value = '';
            }}
            className="hidden" aria-label="Photos" />
          {shown.photos && <span className="mt-1 block text-xs text-red-700">{shown.photos}</span>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50">
            {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {editing ? 'Save the changes' : form.when === 'schedule' ? 'Schedule the post' : 'Post and send to the offices'}
          </button>
          {editing && (
            <button type="button" onClick={stopEdit} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              Cancel
            </button>
          )}
        </div>
        {outcome && (
          <p role={outcome.ok ? 'status' : 'alert'} className={`text-sm ${outcome.ok ? 'text-green-800' : 'text-red-700'}`}>{outcome.text}</p>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="View" className="flex rounded-xl bg-slate-100 p-1">
          {[
            ['list', 'List', List],
            ['calendar', 'Calendar', CalendarDays],
          ].map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${view === id ? 'bg-white text-green-800 shadow-sm' : 'text-slate-600'}`}>
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {view === 'list' && (
          <div className="flex flex-wrap gap-1" aria-label="Show">
            {FILTERS.map(([id, label]) => {
              const n = (posts ?? []).filter((p) => id === 'all' || newsStatus(p) === id).length;
              return (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === id ? 'bg-green-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                  {label} ({n})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {view === 'calendar' ? (
        <NewsCalendar posts={posts ?? []} month={month} onMonth={setMonth} onOpen={startEdit} onNew={startOn} />
      ) : (
      <section aria-label="Posted" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">Posted</h2>
        {posts === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing posted yet.</p>
        ) : (
          <ul className="space-y-3">
            {[...posts]
              .filter((item) => filter === 'all' || newsStatus(item) === filter)
              .sort((a, b) => String(publishTimeOf(b)).localeCompare(String(publishTimeOf(a))))
              .map((item) => {
                const status = newsStatus(item);
                return (
              <li key={item.id} className={`flex gap-4 rounded-2xl border bg-white p-4 ${editing?.id === item.id ? 'border-amber-300' : 'border-slate-200'} ${status === 'archived' ? 'opacity-70' : ''}`}>
                {item.photos?.[0] && <img src={item.photos[0]} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                    {item.title}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[status]}`}>{status}</span>
                  </p>
                  <p className="text-xs text-slate-500">{[publishedWhen(item), whenAndWhere(item) && `Event: ${whenAndWhere(item)}`].filter(Boolean).join(' · ')}</p>
                  {!office && item.office_post && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800 ring-1 ring-sky-200">
                        From {MUNICIPALITY_LIST.find((lgu) => lgu.psgc === Number(item.lgu_psgc))?.label ?? 'an office'}
                      </span>
                      {item.forwarded_at ? (
                        <span className="text-slate-500">Passed on to every office {new Date(item.forwarded_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      ) : status === 'published' ? (
                        <button type="button" onClick={() => forward(item)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
                          <Forward size={12} aria-hidden="true" /> Pass on to every office
                        </button>
                      ) : null}
                    </p>
                  )}
                  {item.body && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.body}</p>}
                  {item.photos?.length > 1 && <p className="mt-1 text-xs text-slate-400">{item.photos.length} photos</p>}
                </div>
                <div className="flex flex-col gap-1 self-start">
                  <button type="button" onClick={() => startEdit(item)} aria-label={`Edit ${item.title}`}
                    className="rounded-lg p-2 text-slate-700 hover:bg-slate-100">
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setArchived(item, status !== 'archived')}
                    aria-label={`${status === 'archived' ? 'Restore' : 'Archive'} ${item.title}`}
                    className="rounded-lg p-2 text-slate-700 hover:bg-slate-100">
                    {status === 'archived' ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                  </button>
                  <button type="button" onClick={() => remove(item)} aria-label={`Delete ${item.title}`}
                    className="rounded-lg p-2 text-red-700 hover:bg-red-50">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
                );
              })}
          </ul>
        )}
      </section>
      )}
    </section>
  );
}
