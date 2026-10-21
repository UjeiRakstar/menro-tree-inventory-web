import { supabase } from '../supabaseClient.js';
import { LIMITS, MAX_ORIGINAL_BYTES, shrinkImage } from './shrinkImage.js';

/**
 * News & Events (supabase/inbox.sql): PGENRO posts them; each post is sent to
 * every office's inbox as a newsletter and shown on the home page.
 */

export const NEWS_BUCKET = 'news-photos';
export const MAX_NEWS_PHOTOS = 5;
// Any photo up to 25 MB is taken; it is resized before it is uploaded.
export const MAX_NEWS_PHOTO_BYTES = MAX_ORIGINAL_BYTES;
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * What kind of event a post is about (21 October). A tree planting, a seminar
 * or an orientation is usually one whole day; a training, a forum or a
 * conference may run longer — the form starts them that way.
 */
export const EVENT_KINDS = Object.freeze([
  { id: 'training', label: 'Training', oneDay: false },
  { id: 'forum', label: 'Forum', oneDay: false },
  { id: 'conference', label: 'Conference', oneDay: false },
  { id: 'seminar', label: 'Seminar', oneDay: true },
  { id: 'orientation', label: 'Orientation', oneDay: true },
  { id: 'tree-planting', label: 'Tree planting', oneDay: true },
  { id: 'clean-up', label: 'Clean-up drive', oneDay: true },
  { id: 'other', label: 'Other', oneDay: true },
]);
export const eventKindLabel = (id) => EVENT_KINDS.find((kind) => kind.id === id)?.label ?? '';

/**
 * What an event counts as toward the City Biodiversity Index — the Singapore
 * Index's governance and management indicators, as TB 2018-02 adopts them.
 */
export const CBI_CREDITS = Object.freeze([
  { id: 'outreach', label: 'Outreach or public awareness event', indicator: 'Outreach and public awareness events held a year' },
  { id: 'partnership', label: 'Partnership', indicator: 'Agencies, companies, NGOs, academic and international organisations partnered with' },
  { id: 'project', label: 'Project or programme', indicator: 'Biodiversity projects and programmes carried out a year' },
  { id: 'policy', label: 'Policy or plan', indicator: 'Policies, rules and plans for biodiversity' },
]);

/**
 * How many events of each CBI credit a place held in a year: its own, and the
 * province-wide ones when the place is Laguna.
 *   lgu    the place's PSGC code, or null for Laguna
 */
export function cbiEventCounts(posts, { lgu = null, year = new Date().getFullYear() } = {}) {
  const counts = Object.fromEntries(CBI_CREDITS.map((credit) => [credit.id, []]));
  for (const post of Array.isArray(posts) ? posts : []) {
    if (!post?.cbi_credit || !counts[post.cbi_credit] || !post.event_date) continue;
    if (Number(String(post.event_date).slice(0, 4)) !== Number(year)) continue;
    if (lgu !== null && Number(post.lgu_psgc) !== Number(lgu)) continue;
    counts[post.cbi_credit].push(post);
  }
  return counts;
}

/** What is wrong with a post before it is saved; empty when it can be. */
export function newsProblems(post, photos = []) {
  const problems = {};
  if (!String(post.title ?? '').trim()) problems.title = 'Give it a title.';
  else if (String(post.title).trim().length > 200) problems.title = 'Keep the title under 200 characters.';
  if (post.event_end_date && !post.event_date) problems.event_date = 'Give the first day too.';
  else if (post.event_end_date && post.event_end_date < post.event_date) problems.event_end_date = 'The last day cannot be before the first.';
  if (photos.length > MAX_NEWS_PHOTOS) problems.photos = `At most ${MAX_NEWS_PHOTOS} photos.`;
  const bad = photos.find((file) => !PHOTO_TYPES.includes(file.type) || file.size > MAX_NEWS_PHOTO_BYTES);
  if (bad) problems.photos = `${bad.name}: photos must be PNG, JPEG or WebP, under 25 MB.`;
  return problems;
}

/**
 * "8 November 2026 · Labuin", "23–25 November 2026 · Capitol", or "30
 * November – 2 December 2026" — the line under a post's title.
 */
export function whenAndWhere(post) {
  return [eventDays(post), post.venue].filter(Boolean).join(' · ');
}

/** An event's day, or its first and last, day first as the newsletter has it (inbox.sql). */
export function eventDays(post) {
  if (!post?.event_date) return '';
  const first = new Date(`${post.event_date}T00:00:00`);
  const month = (date) => date.toLocaleDateString('en-PH', { month: 'long' });
  const whole = (date) => `${date.getDate()} ${month(date)} ${date.getFullYear()}`;
  if (!post.event_end_date || post.event_end_date === post.event_date) return whole(first);
  const last = new Date(`${post.event_end_date}T00:00:00`);
  if (first.getFullYear() !== last.getFullYear()) return `${whole(first)} – ${whole(last)}`;
  if (first.getMonth() !== last.getMonth()) return `${first.getDate()} ${month(first)} – ${whole(last)}`;
  return `${first.getDate()}–${whole(last)}`;
}

/** The photos into the public bucket, each under a name nobody can guess; their URLs. */
export async function uploadNewsPhotos(files) {
  const urls = [];
  for (const picked of files) {
    // Resized first: what the banner shows, and anyone downloads, is the small one.
    const file = await shrinkImage(picked, LIMITS.news);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(NEWS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      throw new Error(
        /bucket not found/i.test(error.message ?? '')
          ? 'The news photos bucket is not there yet. Run supabase/inbox.sql, then post again.'
          : `A photo could not be uploaded: ${error.message}`
      );
    }
    urls.push(supabase.storage.from(NEWS_BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

/** The storage paths of a post's photos, to remove them with the post. */
export const photoPaths = (urls = []) =>
  urls.map((url) => String(url).split(`/${NEWS_BUCKET}/`)[1]).filter(Boolean);

/**
 * Where a post stands (inbox.sql, 19 October): 'archived', kept off the home
 * page; 'scheduled', its time not come yet; or 'published'.
 */
export function newsStatus(post, now = Date.now()) {
  if (post?.archived_at) return 'archived';
  const at = Date.parse(post?.publish_at ?? '');
  return Number.isFinite(at) && at > now ? 'scheduled' : 'published';
}

/** When a post goes, or went, public: the time to sort and to file it on the calendar by. */
export const publishTimeOf = (post) => post?.publish_at ?? post?.created_at ?? null;

const two = (n) => String(n).padStart(2, '0');

/** A day in the browser's own time, as 'YYYY-MM-DD'. */
export function dayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** What a datetime-local input wants ('YYYY-MM-DDTHH:mm'), in the browser's own time. */
export function toLocalInput(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${dayKey(date)}T${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** "Scheduled for 8 November 2026, 8:00 AM" or "Published 19 October 2026". */
export function publishedWhen(post, now = Date.now()) {
  const at = publishTimeOf(post);
  if (!at) return '';
  const date = new Date(at);
  const day = `${date.getDate()} ${date.toLocaleDateString('en-PH', { month: 'long' })} ${date.getFullYear()}`;
  const time = date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return newsStatus(post, now) === 'scheduled' ? `Scheduled for ${day}, ${time}` : `Published ${day}`;
}

/**
 * A month as weeks, Sunday first: [[{ key: 'YYYY-MM-DD', day, inMonth }]],
 * the days of the months either side filling the first and last weeks.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(year, month, 1 - first.getDay() + w * 7 + d);
      week.push({ key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month });
    }
    if (w > 3 && !week.some((cell) => cell.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

/** Sends every post whose time has come (publish_due_news() in inbox.sql). Safe on every page load. */
export async function publishDueNews() {
  try {
    await supabase.rpc('publish_due_news');
  } catch {
    // Not in the database yet, or offline: the next page load tries again.
  }
}
