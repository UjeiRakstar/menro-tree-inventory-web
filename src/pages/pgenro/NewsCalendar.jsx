import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { dayKey, monthGrid, newsStatus, publishTimeOf } from '../../lib/news.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TONE = {
  scheduled: 'bg-white text-green-900 border border-dashed border-green-500',
  published: 'bg-green-700 text-white',
  archived: 'bg-slate-200 text-slate-500 line-through',
};

/**
 * PGENRO's planner (asked 19 October, "like the Business Manager of Meta"):
 * a month of News & Events by the day each goes public — scheduled ones
 * dashed, published filled, archived greyed. A post opens to edit; a day's +
 * starts a post scheduled for it.
 *
 *   month    { year, month } shown (month 0–11)
 *   onMonth  moves to another month
 */
export default function NewsCalendar({ posts, month, onMonth, onOpen, onNew, now = Date.now() }) {
  const today = dayKey(new Date(now));
  const byDay = new Map();
  for (const post of posts) {
    const key = dayKey(publishTimeOf(post));
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(post);
  }
  for (const list of byDay.values()) list.sort((a, b) => String(publishTimeOf(a)).localeCompare(String(publishTimeOf(b))));
  const title = new Date(month.year, month.month, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const step = (by) => {
    const next = new Date(month.year, month.month + by, 1);
    onMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <section aria-label="Calendar" className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <h2 className="min-w-[10rem] text-center text-base font-bold text-slate-900">{title}</h2>
        <button type="button" onClick={() => step(1)} aria-label="Next month" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onMonth({ year: new Date(now).getFullYear(), month: new Date(now).getMonth() })}
          className="ml-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50"
        >
          This month
        </button>
        <p className="ml-auto flex flex-wrap gap-3 text-[11px] text-slate-500">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-green-500" aria-hidden="true" />Scheduled</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-green-700" aria-hidden="true" />Published</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" aria-hidden="true" />Archived</span>
        </p>
      </div>
      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="pb-1 text-center font-semibold text-slate-500">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month.year, month.month).map((week) => (
            <tr key={week[0].key}>
              {week.map((cell) => {
                const list = byDay.get(cell.key) ?? [];
                const past = cell.key < today;
                return (
                  <td
                    key={cell.key}
                    data-day={cell.key}
                    className={`group h-24 border border-slate-100 p-1 align-top ${cell.inMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'} ${
                      cell.key === today ? 'ring-2 ring-inset ring-green-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${cell.key === today ? 'text-green-800' : ''}`}>{cell.day}</span>
                      {!past && (
                        <button
                          type="button"
                          onClick={() => onNew(cell.key)}
                          aria-label={`New post for ${cell.key}`}
                          className="rounded p-0.5 text-green-700 opacity-0 hover:bg-green-50 focus:opacity-100 group-hover:opacity-100"
                        >
                          <Plus size={12} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {list.map((post) => (
                        <li key={post.id}>
                          <button
                            type="button"
                            onClick={() => onOpen(post)}
                            title={post.title}
                            className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] font-semibold ${TONE[newsStatus(post, now)]}`}
                          >
                            {post.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
