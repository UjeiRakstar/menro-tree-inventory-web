import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Megaphone, Trash2, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { MAX_NEWS_PHOTOS, NEWS_BUCKET, newsProblems, photoPaths, uploadNewsPhotos, whenAndWhere } from '../../lib/news.js';

const EMPTY = { title: '', event_date: '', venue: '', body: '' };
const input = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none';

/**
 * PGENRO's News & Events. A post is sent to every MENRO / CENRO's inbox as a
 * newsletter the moment it is saved (supabase/inbox.sql), and shown on the
 * home page. Deleting it takes it off the home page; the copies already in
 * the offices' inboxes are theirs to delete.
 */
export default function NewsPage() {
  const [posts, setPosts] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [photos, setPhotos] = useState([]);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('news_posts').select('*').order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) setOutcome({ ok: false, text: /does not exist|Could not find the table/i.test(error.message) ? 'News & Events needs supabase/inbox.sql, which has not been run yet.' : error.message });
      setPosts(Array.isArray(data) ? data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const problems = newsProblems(form, photos);
  const shown = tried ? problems : {};
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function pick(event) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    setPhotos((current) => [...current, ...picked].slice(0, MAX_NEWS_PHOTOS + 1));
  }

  async function post(event) {
    event.preventDefault();
    setTried(true);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    setSaving(true);
    try {
      const urls = await uploadNewsPhotos(photos);
      const row = {
        title: form.title.trim(),
        body: form.body.trim(),
        venue: form.venue.trim() || null,
        event_date: form.event_date || null,
        photos: urls,
      };
      const { data, error } = await supabase.from('news_posts').insert(row).select().single();
      if (error) {
        if (urls.length) await supabase.storage.from(NEWS_BUCKET).remove(photoPaths(urls));
        throw new Error(error.message);
      }
      setPosts((current) => [data ?? { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...(current ?? [])]);
      setForm(EMPTY);
      setPhotos([]);
      setTried(false);
      setOutcome({ ok: true, text: 'Posted. Every MENRO / CENRO has it in their inbox, and it is on the home page.' });
    } catch (failure) {
      setOutcome({ ok: false, text: `Not posted: ${failure.message}` });
    } finally {
      setSaving(false);
    }
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
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Megaphone size={24} className="text-green-700" aria-hidden="true" /> News &amp; Events
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Each post goes to every MENRO / CENRO&apos;s inbox as a newsletter, and onto the home page.
        </p>
      </div>

      <form onSubmit={post} noValidate aria-label="New post" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Title</span>
          <input value={form.title} onChange={set('title')} className={input} aria-invalid={Boolean(shown.title)} />
          {shown.title && <span className="mt-1 block text-xs text-red-700">{shown.title}</span>}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Date</span>
            <input type="date" value={form.event_date} onChange={set('event_date')} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Venue</span>
            <input value={form.venue} onChange={set('venue')} className={input} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Description</span>
          <textarea rows={5} value={form.body} onChange={set('body')} className={`${input} resize-y`} />
        </label>
        <div>
          <span className="text-sm font-semibold text-slate-700">Photos</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {photos.map((file, i) => (
              <span key={`${file.name}-${i}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {file.name}
                <button type="button" onClick={() => setPhotos((current) => current.filter((_, j) => j !== i))} aria-label={`Remove ${file.name}`}>
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            {photos.length < MAX_NEWS_PHOTOS && (
              <button type="button" onClick={() => fileInput.current?.click()}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
                <ImagePlus size={13} aria-hidden="true" /> Add a photo
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={pick} className="hidden" aria-label="Photos" />
          {shown.photos && <span className="mt-1 block text-xs text-red-700">{shown.photos}</span>}
        </div>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50">
          {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          Post and send to the offices
        </button>
        {outcome && (
          <p role={outcome.ok ? 'status' : 'alert'} className={`text-sm ${outcome.ok ? 'text-green-800' : 'text-red-700'}`}>{outcome.text}</p>
        )}
      </form>

      <section aria-label="Posted" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">Posted</h2>
        {posts === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing posted yet.</p>
        ) : (
          <ul className="space-y-3">
            {posts.map((item) => (
              <li key={item.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                {item.photos?.[0] && <img src={item.photos[0]} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{item.title}</p>
                  {whenAndWhere(item) && <p className="text-xs text-slate-500">{whenAndWhere(item)}</p>}
                  {item.body && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.body}</p>}
                </div>
                <button type="button" onClick={() => remove(item)} aria-label={`Delete ${item.title}`}
                  className="self-start rounded-lg p-2 text-red-700 hover:bg-red-50">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
