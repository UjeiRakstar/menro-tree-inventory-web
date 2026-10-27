import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { dayKey, eventKindLabel, monthGrid, newsStatus, venueMapLink, whenAndWhere } from '../../lib/news.js';
import { MUNICIPALITY_LIST } from '../../lib/lguOptions.js';
import { officialName } from '../../lib/psgc.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** An event's first and last day, as 'YYYY-MM-DD'. */
const spanOf = (post) => [post.event_date, post.event_end_date || post.event_date];

/** Whose activity it is: the LGU's office, or PGENRO's. */
export function hostOf(post) {
  const lgu = post?.lgu_psgc ? MUNICIPALITY_LIST.find((item) => item.psgc === Number(post.lgu_psgc)) : null;
  return lgu ? officialName(lgu) : 'PGENRO Laguna';
}

/**
 * The calendar of activities on the home page (27 October): every published
 * News & Events post that has an event date, on the days it runs — a
 * training over three days on all three. A day's activity opens its details
 * under the month. On a phone the days show a dot, and the month's list under
 * the grid says what they are.
 *
 * Nothing at all when the posts cannot be read (the table not there yet).
 */
export default function ActivitiesCalendar({ now = Date.now() }) {
  const [posts, setPosts] = useState(null);
  const [month, setMonth] = useState(() => ({ year: new Date(now).getFullYear(), month: new Date(now).getMonth() }));
  const [chosen, setChosen] = useState(null);
  const today = dayKey(new Date(now));
  const { hash } = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('news_posts').select('*');
      if (cancelled) return;
      if (error || !Array.isArray(data)) return setPosts(false);
      // Published and not archived only, as on the banner: PGENRO's own
      // session reads its scheduled and archived posts too.
      setPosts(
        data
          .filter((post) => post.event_date && newsStatus(post) === 'published')
          .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // From the footer's News and Events (/about#activities): brought into view
  // once the month is drawn, the page having opened at its top.
  const loaded = posts !== null;
  useEffect(() => {
    if (hash === '#activities' && loaded) document.getElementById('activities')?.scrollIntoView?.({ behavior: 'smooth' });
  }, [hash, loaded]);

  const weeks = useMemo(() => monthGrid(month.year, month.month), [month]);
  const first = weeks[0][0].key;
  const last = weeks.at(-1).at(-1).key;
  const inMonth = (posts || []).filter((post) => {
    const [from, to] = spanOf(post);
    const monthFrom = dayKey(new Date(month.year, month.month, 1));
    const monthTo = dayKey(new Date(month.year, month.month + 1, 0));
    return from <= monthTo && to >= monthFrom;
  });
  const onDay = (key) => (posts || []).filter((post) => {
    const [from, to] = spanOf(post);
    return key >= first && key <= last && from <= key && to >= key;
  });
  // With nothing this month, the next activity is a click away.
  const monthEnd = dayKey(new Date(month.year, month.month + 1, 0));
  const next = inMonth.length === 0 ? (posts || []).find((post) => post.event_date > monthEnd) : null;

  if (posts === false) return null;

  const title = new Date(month.year, month.month, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const goTo = (year, m) => {
    const date = new Date(year, m, 1);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
    setChosen(null);
  };
  const shown = chosen && posts ? posts.find((post) => post.id === chosen) : null;

  return (
    <section id="activities" aria-labelledby="activities-title" className="scroll-mt-20 bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-[2px] w-8 rounded-full bg-green-500" />
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-green-600 sm:text-sm">Join us</span>
        </div>
        <h2 id="activities-title" className="mb-8 text-[2.25rem] font-black uppercase leading-none tracking-tight text-gray-900 sm:text-[3rem]">
          <span className="text-green-800">Calendar of</span> Activities
        </h2>

        <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => goTo(month.year, month.month - 1)} aria-label="Previous month"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <h3 className="min-w-[10rem] text-center text-lg font-bold text-slate-900" aria-live="polite">{title}</h3>
            <button type="button" onClick={() => goTo(month.year, month.month + 1)} aria-label="Next month"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => goTo(new Date(now).getFullYear(), new Date(now).getMonth())}
              className="ml-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
              This month
            </button>
          </div>

          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr>
                {WEEKDAYS.map((d) => (
                  <th key={d} scope="col" className="pb-1 text-center font-semibold text-slate-500">
                    <span className="sm:hidden">{d[0]}</span>
                    <span className="hidden sm:inline">{d}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0].key}>
                  {week.map((cell) => {
                    const list = onDay(cell.key);
                    return (
                      <td key={cell.key} data-day={cell.key}
                        className={`h-12 border border-slate-100 p-0.5 align-top sm:h-24 sm:p-1 ${cell.inMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'} ${
                          cell.key === today ? 'ring-2 ring-inset ring-green-600' : ''}`}>
                        <span className={`block text-right text-[11px] font-semibold ${cell.key < today ? 'text-slate-400' : 'text-slate-600'}`}>{cell.day}</span>
                        {/* A phone: a dot a day, the list below says what. */}
                        {list.length > 0 && (
                          <span className="mt-1 flex justify-center gap-0.5 sm:hidden" aria-hidden="true">
                            {list.slice(0, 3).map((post) => <span key={post.id} className="h-1.5 w-1.5 rounded-full bg-green-600" />)}
                          </span>
                        )}
                        <ul className="mt-0.5 hidden space-y-0.5 sm:block">
                          {list.slice(0, 3).map((post) => (
                            <li key={post.id}>
                              <button type="button" onClick={() => setChosen(post.id)} aria-pressed={chosen === post.id}
                                title={post.title}
                                className={`w-full truncate rounded px-1 py-0.5 text-left text-[11px] font-semibold ${
                                  chosen === post.id ? 'bg-lime-300 text-green-950' : spanOf(post)[1] < today ? 'bg-green-100 text-green-800' : 'bg-green-700 text-white hover:bg-green-800'}`}>
                                {post.title}
                              </button>
                            </li>
                          ))}
                          {list.length > 3 && <li className="px-1 text-[10px] text-slate-500">+{list.length - 3} more</li>}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {shown && (
            <article aria-label={shown.title} className="mt-4 rounded-2xl bg-green-50 p-4 ring-1 ring-green-200 sm:p-5">
              <ActivityDetails post={shown} />
            </article>
          )}

          {/* The month's activities, as a list: what a phone's dots stand for. */}
          <div className="mt-4">
            {posts === null ? (
              <p className="text-sm text-slate-500">Loading the activities…</p>
            ) : inMonth.length === 0 ? (
              <p className="text-sm text-slate-500">
                No activities posted for {title}.{' '}
                {next && (
                  <button type="button" onClick={() => {
                    const date = new Date(`${next.event_date}T00:00:00`);
                    goTo(date.getFullYear(), date.getMonth());
                    setChosen(next.id);
                  }} className="font-semibold text-green-800 underline underline-offset-2 hover:text-green-900">
                    Next: {next.title}, {whenAndWhere({ event_date: next.event_date })}
                  </button>
                )}
              </p>
            ) : (
              <ul aria-label={`Activities in ${title}`} className="divide-y divide-slate-100">
                {inMonth.map((post) => (
                  <li key={post.id}>
                    <button type="button" onClick={() => setChosen(post.id)} aria-pressed={chosen === post.id}
                      className={`flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 py-2 text-left hover:bg-slate-50 ${chosen === post.id ? 'bg-green-50' : ''}`}>
                      <span className="w-full text-xs font-semibold text-green-700 sm:w-48 sm:shrink-0">{whenAndWhere({ ...post, venue: null })}</span>
                      <span className="text-sm font-semibold text-slate-900">{post.title}</span>
                      <span className="text-xs text-slate-500">{hostOf(post)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ActivityDetails({ post }) {
  const kind = eventKindLabel(post.event_kind);
  const map = venueMapLink(post);
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-wider text-green-700">
        {[kind, hostOf(post)].filter(Boolean).join(' · ')}
      </p>
      <h4 className="mt-1 text-lg font-extrabold leading-tight text-slate-900 sm:text-xl">{post.title}</h4>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <CalendarDays size={15} aria-hidden="true" className="text-green-700" /> {whenAndWhere(post)}
      </p>
      {post.body && <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{post.body}</p>}
      {map && (
        <a href={map} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-green-800 underline underline-offset-4 hover:text-green-900">
          <MapPin size={15} aria-hidden="true" /> See it on the map
        </a>
      )}
    </>
  );
}
