import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { whenAndWhere } from '../../lib/news.js';

/**
 * PGENRO's News & Events on the home page (supabase/inbox.sql): the newest as
 * a banner across the page, its photo behind it, the others under it. Nothing
 * at all when there is no post, or before the table exists — an empty banner
 * would be the first thing a visitor sees.
 */
export default function NewsBanner({ limit = 6 }) {
  const [posts, setPosts] = useState([]);
  const [at, setAt] = useState(0);
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

  if (posts.length === 0) return null;
  const post = posts[Math.min(at, posts.length - 1)];
  const photo = post.photos?.[0];
  const step = (by) => {
    setExpanded(false);
    setAt((current) => (current + by + posts.length) % posts.length);
  };

  return (
    <section id={`news-${post.id}`} aria-label="News and Events" className="bg-green-950 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-lime-300">
          <Megaphone size={18} aria-hidden="true" /> News &amp; Events
        </h2>
        <article className="relative overflow-hidden rounded-3xl bg-green-900 text-white shadow-2xl">
          {photo && (
            <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          )}
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
            {post.photos?.length > 1 && expanded && (
              <div className="flex gap-2 overflow-x-auto pt-2">
                {post.photos.slice(1).map((url) => (
                  <img key={url} src={url} alt="" className="h-24 w-36 shrink-0 rounded-lg object-cover ring-1 ring-white/20" />
                ))}
              </div>
            )}
          </div>
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
