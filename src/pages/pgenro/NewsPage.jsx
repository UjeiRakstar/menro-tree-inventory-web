import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, ImagePlus, Loader2, Megaphone, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { MAX_NEWS_PHOTOS, NEWS_BUCKET, newsProblems, photoPaths, uploadNewsPhotos, whenAndWhere } from '../../lib/news.js';

const EMPTY = { title: '', event_date: '', venue: '', body: '' };
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
 * newsletter the moment it is saved (supabase/inbox.sql), and shown on the
 * home page. A post can be edited after it is published — the home page shows
 * the change; the newsletter already sent is not sent again. Deleting it takes
 * it off the home page; the copies in the offices' inboxes are theirs to delete.
 *
 * Photos come from a file, a drag onto the photos, or a paste — a photo copied
 * from anywhere, pasted with Ctrl+V while this page is open.
 */
export default function NewsPage() {
  const [posts, setPosts] = useState(null);
  const [form, setForm] = useState(EMPTY);
  // Editing a post: its photos already online, kept until removed.
  const [editing, setEditing] = useState(null);
  const [kept, setKept] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const fileInput = useRef(null);
  const formRef = useRef(null);

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

  const problems = newsProblems(form, photos);
  if (!problems.photos && kept.length + photos.length > MAX_NEWS_PHOTOS) problems.photos = `At most ${MAX_NEWS_PHOTOS} photos.`;
  const shown = tried ? problems : {};
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function startEdit(item) {
    setEditing(item);
    setForm({ title: item.title ?? '', event_date: item.event_date ?? '', venue: item.venue ?? '', body: item.body ?? '' });
    setKept(Array.isArray(item.photos) ? item.photos : []);
    setPhotos([]);
    setTried(false);
    setOutcome(null);
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function stopEdit() {
    setEditing(null);
    setForm(EMPTY);
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
        photos: [...kept, ...uploaded],
      };
      if (editing) {
        const { data, error } = await supabase.from('news_posts').update(row).eq('id', editing.id).select().single();
        if (error) throw new Error(error.message);
        // Photos taken off the post come off storage too, once the post no longer shows them.
        const dropped = photoPaths((editing.photos ?? []).filter((url) => !kept.includes(url)));
        if (dropped.length) await supabase.storage.from(NEWS_BUCKET).remove(dropped);
        setPosts((current) => current.map((p) => (p.id === editing.id ? { ...p, ...row, ...(data ?? {}) } : p)));
        setOutcome({ ok: true, text: 'Saved. The home page shows the change; the newsletter already sent is not sent again.' });
      } else {
        const { data, error } = await supabase.from('news_posts').insert(row).select().single();
        if (error) throw new Error(error.message);
        setPosts((current) => [data ?? { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...(current ?? [])]);
        setOutcome({ ok: true, text: 'Posted. Every MENRO / CENRO has it in their inbox, and it is on the home page.' });
      }
      setEditing(null);
      setForm(EMPTY);
      setKept([]);
      setPhotos([]);
      setTried(false);
    } catch (failure) {
      if (uploaded.length) await supabase.storage.from(NEWS_BUCKET).remove(photoPaths(uploaded));
      setOutcome({ ok: false, text: `${editing ? 'Not saved' : 'Not posted'}: ${failure.message}` });
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
    if (editing?.id === item.id) stopEdit();
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
            {editing ? 'Save the changes' : 'Post and send to the offices'}
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

      <section aria-label="Posted" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">Posted</h2>
        {posts === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing posted yet.</p>
        ) : (
          <ul className="space-y-3">
            {posts.map((item) => (
              <li key={item.id} className={`flex gap-4 rounded-2xl border bg-white p-4 ${editing?.id === item.id ? 'border-amber-300' : 'border-slate-200'}`}>
                {item.photos?.[0] && <img src={item.photos[0]} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{item.title}</p>
                  {whenAndWhere(item) && <p className="text-xs text-slate-500">{whenAndWhere(item)}</p>}
                  {item.body && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.body}</p>}
                  {item.photos?.length > 1 && <p className="mt-1 text-xs text-slate-400">{item.photos.length} photos</p>}
                </div>
                <div className="flex flex-col gap-1 self-start">
                  <button type="button" onClick={() => startEdit(item)} aria-label={`Edit ${item.title}`}
                    className="rounded-lg p-2 text-slate-700 hover:bg-slate-100">
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => remove(item)} aria-label={`Delete ${item.title}`}
                    className="rounded-lg p-2 text-red-700 hover:bg-red-50">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
