/**
 * The inbox (supabase/inbox.sql): what each kind of message is, how a reply
 * to the public is written, and where a message's link goes.
 *
 * One inbox per office — PGENRO's, or an LGU's MENRO / CENRO — keyed as office
 * profiles are: 'pgenro' or the LGU's PSGC code as text.
 */

export const INBOX_KINDS = Object.freeze({
  notice: { label: 'Notice', tone: 'bg-sky-100 text-sky-800' },
  news: { label: 'News & Events', tone: 'bg-amber-100 text-amber-900' },
  rise: { label: 'Species library', tone: 'bg-violet-100 text-violet-800' },
  contact: { label: 'Message', tone: 'bg-green-100 text-green-800' },
});

/** The folders down the side of the inbox, and which messages each holds. */
export const INBOX_FOLDERS = Object.freeze([
  { id: 'all', label: 'Inbox', holds: (m) => !m.archived_at },
  { id: 'contact', label: 'Messages', holds: (m) => !m.archived_at && m.kind === 'contact' },
  { id: 'notice', label: 'Notices', holds: (m) => !m.archived_at && (m.kind === 'notice' || m.kind === 'rise') },
  { id: 'news', label: 'News & Events', holds: (m) => !m.archived_at && m.kind === 'news' },
  { id: 'archived', label: 'Archived', holds: (m) => Boolean(m.archived_at) },
]);

export const folderById = (id) => INBOX_FOLDERS.find((folder) => folder.id === id) ?? INBOX_FOLDERS[0];

/** When a message came, as a list shows it: the time today, the date before. */
export function receivedAt(value, now = new Date()) {
  if (!value) return '';
  const date = new Date(value);
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/**
 * A reply to the public, opened in the office's own email: addressed to the
 * sender, with what they wrote quoted under it.
 */
export function replyMailto(message, { officeName = '' } = {}) {
  const sent = message.created_at
    ? new Date(message.created_at).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })
    : '';
  const quoted = String(message.body ?? '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  const body = [
    `Dear ${message.sender_name ?? ''},`,
    '',
    '',
    '',
    officeName,
    '',
    `On ${sent}, ${message.sender_name ?? 'you'} wrote through Green Tag:`,
    quoted,
  ].join('\n');
  const subject = `Re: your message to ${officeName || 'our office'}`;
  return `mailto:${encodeURIComponent(message.sender_email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Where a message's link opens, or null: an area or a tree on the office map
 * (outside the office's own LGU the map shows it without its actions), or the
 * news post on the home page.
 */
export function linkOf(message) {
  const link = message?.link;
  if (!link) return null;
  if (link.kind === 'area' && link.id) return { to: `/map?area=${encodeURIComponent(link.id)}`, label: 'View on map' };
  if (link.kind === 'tree' && link.id) {
    const at = Number.isFinite(Number(link.lat)) && Number.isFinite(Number(link.lng)) ? `lat=${link.lat}&lng=${link.lng}&` : '';
    return { to: `/map?${at}tree=${encodeURIComponent(link.id)}`, label: 'View the tree on map' };
  }
  if (link.kind === 'news' && link.id) return { to: `/about#news-${link.id}`, label: 'See it on the website' };
  return null;
}
