/**
 * When the inventory was last added to, and how it has grown.
 *
 * Every figure on the dashboard was true at some moment and nothing said
 * which. A reader cannot tell a province with 112 trees surveyed last week
 * from one surveyed two years ago, and those are different claims.
 *
 * ON THE WORD "STALE"
 * A survey whose newest tree was tagged six weeks ago is not out of date. It
 * means nobody has been out in six weeks, which is a fact about the survey and
 * not a fault in the data. So this reports when, and leaves the judgement to
 * the reader.
 */

/** How many days counts as recent, for the "lately" figure. */
export const RECENT_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

/**
 * When a tree was tagged, or null.
 *
 * The field app writes an ISO string with no timezone, which JavaScript reads
 * as local time — correct here, since the surveyor and the reader are both in
 * the Philippines.
 */
export function capturedAt(tree) {
  const raw = tree?.dateCaptured ?? tree?.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The newest tag in a set, or null when none of them is dated. */
export function lastTagged(trees) {
  let newest = null;
  for (const tree of Array.isArray(trees) ? trees : []) {
    const date = capturedAt(tree);
    if (date && (!newest || date > newest)) newest = date;
  }
  return newest;
}

/** How many were tagged in the last `days` days. */
export function taggedRecently(trees, days = RECENT_DAYS, now = new Date()) {
  const since = now.getTime() - days * DAY;
  let count = 0;
  for (const tree of Array.isArray(trees) ? trees : []) {
    const date = capturedAt(tree);
    if (date && date.getTime() >= since && date.getTime() <= now.getTime()) count += 1;
  }
  return count;
}

/** How many carry no date at all. */
export function undated(trees) {
  return (Array.isArray(trees) ? trees : []).filter((tree) => !capturedAt(tree)).length;
}

/** "25 August 2026" — the same shape wherever a date is printed. */
export function formatDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * How long ago, in words a reader does not have to do arithmetic on.
 *
 * Rounded down and deliberately coarse: "about 2 months ago" is the useful
 * claim, and "61 days ago" invites a precision the survey does not have.
 */
export function timeAgo(date, now = new Date()) {
  if (!date) return '';
  const days = Math.floor((now.getTime() - date.getTime()) / DAY);

  if (days < 0) return 'just now';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `about ${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'about a year ago' : `about ${years} years ago`;
}

/**
 * The inventory month by month, as a running total.
 *
 * Months with no tagging are included — a flat stretch is as much a part of
 * the story as a steep one, and leaving the gaps out would draw a survey that
 * never paused.
 */
export function taggingTimeline(trees) {
  const perMonth = new Map();

  for (const tree of Array.isArray(trees) ? trees : []) {
    const date = capturedAt(tree);
    if (!date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
  }

  const keys = [...perMonth.keys()].sort();
  if (keys.length === 0) return [];

  const [firstYear, firstMonth] = keys[0].split('-').map(Number);
  const [lastYear, lastMonth] = keys[keys.length - 1].split('-').map(Number);

  const months = [];
  let running = 0;
  const cursor = new Date(firstYear, firstMonth - 1, 1);
  const end = new Date(lastYear, lastMonth - 1, 1);

  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const added = perMonth.get(key) ?? 0;
    running += added;
    months.push({
      key,
      label: cursor.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      added,
      total: running,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}
