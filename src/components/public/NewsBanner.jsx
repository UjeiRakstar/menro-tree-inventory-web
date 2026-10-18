import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { whenAndWhere } from '../../lib/news.js';

/** How long each photo of a post shows before the next fades in. */
export const PHOTO_SECONDS = 5;

const prefersStill = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/**
 * PGENRO's News & Events on the home page (supabase/inbox.sql): the newest as
 * a banner across the page, its photos behind it — turning from one to the
 * next when it has two or more, unless the visitor's device asks for less
 * motion — and the other posts a click away. Nothing at all when there is no
 * post, or before the table exists: an empty banner would be the first thing a
 * visitor sees.
 */
export default function NewsBanner({ limit = 6 }) {
  const [posts, setPosts] = useState([]);
  const [at, setAt] = useState(0);
  const [photoAt, setPhotoAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('news_posts').select('*').order('created_at', { ascending: false }).limit(limit);
      if (!cancelled && !error && Array.isArray(data)) setPosts(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  // A link from an office's inbox (#news-<id>) opens on that post.
  useEffect(() => {
    const id = window.location.hash.replace(/^#news-/, '');
    const index = posts.findIndex((post) => post.id === id);
    if (index >= 0) setAt(index);
  }, [posts]);

  const post = posts.length ? posts[Math.min(at, posts.length - 1)] : null;
  const photos = Array.isArray(post?.photos) ? post.photos : [];

  // The photos turn, one every few seconds, while nobody is pointing at the banner.
  useEffect(() => {
    if (photos.length < 2 || paused || prefersStill()) return undefined;
    const timer = setInterval(() => setPhotoAt((current) => (current + 1) % photos.length), PHOTO_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [photos.length, paused]);

  if (!post) return null;
  const step = (by) => {
    setExpanded(false);
    setPhotoAt(0);
    setAt((current) => (current + by + posts.length) % posts.length);
  };

  return (
    <section id={`news-${post.id}`} aria-label="News and Events" className="bg-green-950 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-lime-300">
          <Megaphone size={18} aria-hidden="true" /> News &amp; Events
        </h2>
        <article
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="relative overflow-hidden rounded-3xl bg-green-900 text-white shadow-2xl"
        >
          {photos.map((url, i) => (
            <img
              key={url}
              src={url}
              alt=""
              data-showing={i === photoAt % photos.length ? 'true' : undefined}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
                i === photoAt % photos.length ? 'opacity-40' : 'opacity-0'
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-green-950/95 via-green-950/70 to-transparent" aria-hidden="true" />
          <div className="relative flex min-h-[18rem] flex-col justify-end gap-3 p-6 sm:p-10 md:w-2/3">
            {whenAndWhere(post) && (
              <p className="flex items-center gap-2 text-sm font-semibold text-lime-200">
                <CalendarDays size={16} aria-hidden="true" /> {whenAndWhere(post)}
              </p>
            )}
            <h3 className="text-2xl font-extrabold leading-tight sm:text-4xl">{post.title}</h3>
            {post.body && (
              <p className={`whitespace-pre-wrap text-sm leading-relaxed text-green-50 sm:text-base ${expanded ? '' : 'line-clamp-3'}`}>
                {post.body}
              </p>
            )}
            {post.body && post.body.length > 220 && (
              <button type="button" onClick={() => setExpanded((open) => !open)}
                className="self-start text-sm font-bold text-lime-300 underline underline-offset-4 hover:text-lime-200">
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>

          {photos.length > 1 && (
            <div className="absolute bottom-4 left-6 flex gap-1.5 sm:left-10" role="group" aria-label="Photos">
              {photos.map((url, i) => (
                <button key={url} type="button" onClick={() => setPhotoAt(i)}
                  aria-label={`Photo ${i + 1} of ${photos.length}`} aria-pressed={i === photoAt % photos.length}
                  className={`h-2 rounded-full transition-all ${i === photoAt % photos.length ? 'w-6 bg-lime-300' : 'w-2 bg-white/50 hover:bg-white/80'}`} />
              ))}
            </div>
          )}
          {posts.length > 1 && (
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <button type="button" onClick={() => step(-1)} aria-label="Previous news"
                className="rounded-full bg-white/15 p-2 hover:bg-white/25">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="text-xs font-semibold text-green-100">{at + 1} / {posts.length}</span>
              <button type="button" onClick={() => step(1)} aria-label="Next news"
                className="rounded-full bg-white/15 p-2 hover:bg-white/25">
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
