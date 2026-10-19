import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Inbox as InboxIcon, Loader2, Mail, MapPinned, Reply, Send, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isPgenro } from '../lib/roles.js';
import { officeOf } from '../lib/officeSettings.js';
import { officialName } from '../lib/psgc.js';
import { MUNICIPALITY_LIST } from '../lib/lagunaBoundaries.js';
import { INBOX_FOLDERS, INBOX_KINDS, folderById, linkOf, receivedAt, replyMailto } from '../lib/inbox.js';
import { MAX_REPLY_CHARACTERS, loadReplies, replyChannelOf, sendReply } from '../lib/replies.js';

const isMissingTable = (error) => /relation .*inbox_messages.* does not exist|Could not find the table/i.test(error?.message ?? '');

/**
 * The office's inbox (supabase/inbox.sql): PGENRO's notices and News & Events,
 * the public's messages, and — for PGENRO — trees saved under a species the
 * RISE library does not have. Read, reply by email, archive, delete.
 */
export default function Inbox() {
  const { profile } = useAuth();
  const pgenro = isPgenro(profile);
  const office = officeOf(profile);
  const officeName = pgenro
    ? 'PGENRO, Province of Laguna'
    : `${officialName(MUNICIPALITY_LIST.find((lgu) => lgu.psgc === Number(office)))} MENRO / CENRO`;

  const [messages, setMessages] = useState(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [folder, setFolder] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The database shows an office its own inbox only.
      const { data, error: loadError } = await supabase
        .from('inbox_messages')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (loadError) {
        setMissing(isMissingTable(loadError));
        setError(isMissingTable(loadError) ? '' : loadError.message);
        setMessages([]);
        return;
      }
      setMessages(Array.isArray(data) ? data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // A message that arrives while the inbox is open appears without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel('inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inbox_messages' }, () => setTick((n) => n + 1))
      .subscribe();
    return () => supabase.removeChannel?.(channel);
  }, []);

  const shown = useMemo(() => (messages ?? []).filter(folderById(folder).holds), [messages, folder]);
  const unread = (id) => (messages ?? []).filter((m) => folderById(id).holds(m) && !m.read_at).length;
  const open = (messages ?? []).find((m) => m.id === openId) ?? null;

  async function change(id, fields) {
    setError('');
    const { error: saveError } = await supabase.from('inbox_messages').update(fields).eq('id', id);
    if (saveError) {
      setError(saveError.message);
      return false;
    }
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, ...fields } : m)));
    return true;
  }

  async function read(message) {
    setOpenId(message.id);
    if (!message.read_at) await change(message.id, { read_at: new Date().toISOString() });
  }

  async function remove(message) {
    if (!window.confirm(`Delete "${message.subject}"? It cannot be brought back.`)) return;
    setError('');
    const { error: deleteError } = await supabase.from('inbox_messages').delete().eq('id', message.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMessages((current) => current.filter((m) => m.id !== message.id));
    setOpenId(null);
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <InboxIcon size={24} className="text-green-700" aria-hidden="true" /> Inbox
        </h1>
        <p className="mt-1 text-sm text-slate-500">{officeName}</p>
      </div>

      {missing && (
        <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          The inbox needs supabase/inbox.sql, which has not been run yet.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-col gap-4 lg:flex-row">
        <nav aria-label="Folders" className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col">
          {INBOX_FOLDERS.map((item) => {
            const count = item.id === 'archived' ? 0 : unread(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFolder(item.id);
                  setOpenId(null);
                }}
                aria-current={folder === item.id ? 'page' : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                  folder === item.id ? 'bg-green-100 text-green-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="flex-1">{item.label}</span>
                {count > 0 && (
                  <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white" aria-label={`${count} unread`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {messages === null ? (
            <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading the inbox…
            </p>
          ) : shown.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Nothing here.</p>
          ) : (
            <ul aria-label={folderById(folder).label} className="divide-y divide-slate-100">
              {shown.map((message) => {
                const kind = INBOX_KINDS[message.kind] ?? INBOX_KINDS.notice;
                const isOpen = openId === message.id;
                return (
                  <li key={message.id} className={message.read_at ? '' : 'bg-green-50/60'}>
                    <button
                      type="button"
                      onClick={() => (isOpen ? setOpenId(null) : read(message))}
                      aria-expanded={isOpen}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      {!message.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-600" aria-label="Unread" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${kind.tone}`}>{kind.label}</span>
                          <span className={`truncate text-sm ${message.read_at ? 'text-slate-700' : 'font-bold text-slate-900'}`}>{message.subject}</span>
                        </span>
                        {!isOpen && <span className="mt-0.5 block truncate text-xs text-slate-500">{message.body}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{receivedAt(message.created_at)}</span>
                    </button>
                    {isOpen && open && <MessageBody message={open} officeName={officeName} onChange={change} onDelete={remove} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Replying to a message from the public, without leaving Green Tag (19
 * October): in Green Tag to a resident who wrote signed in, by email — sent by
 * the system — to a guest. Until sending email is set up (the send-reply
 * function), a guest is answered from the office's own email app.
 */
function ReplyBox({ message, officeName }) {
  const channel = replyChannelOf(message);
  const [replies, setReplies] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadReplies(message.id).then(({ replies: found }) => {
      // Merged, not replaced: a reply sent while these were loading stays.
      if (!cancelled) setReplies((current) => [...found, ...current.filter((reply) => String(reply.id).startsWith('new-'))]);
    });
    return () => {
      cancelled = true;
    };
  }, [message.id]);

  async function send(event) {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);
    const result = await sendReply(message, text);
    setBusy(false);
    if (result.ok) {
      setReplies((current) => [...current, { id: `new-${Date.now()}`, body: text.trim(), channel, created_at: new Date().toISOString() }]);
      setText('');
      setOutcome({ ok: true, text: channel === 'in-app' ? 'Sent. It waits for them in Green Tag.' : `Sent to ${message.sender_email}.` });
    } else if (result.notSetUp) {
      setOutcome({ ok: false, notSetUp: true, text: 'Sending email from Green Tag is not set up yet. Open your email app instead — the reply is written for you there.' });
    } else {
      setOutcome({ ok: false, text: result.problem });
    }
  }

  return (
    <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      {replies.length > 0 && (
        <ol className="space-y-2" aria-label="Replies sent">
          {replies.map((sent) => (
            <li key={sent.id} className="rounded-lg bg-green-50 px-3 py-2 text-sm text-slate-800">
              <span className="block text-[11px] font-semibold text-green-800">
                {sent.channel === 'in-app' ? 'Replied in Green Tag' : 'Replied by email'} · {receivedAt(sent.created_at)}
                {sent.sent_by_name ? ` · ${sent.sent_by_name}` : ''}
              </span>
              <span className="whitespace-pre-wrap">{sent.body}</span>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={send} className="space-y-2">
        <label className="block text-xs font-semibold text-slate-700">
          {channel === 'in-app'
            ? `Reply to ${message.sender_name} in Green Tag — they signed in with Google, and read it there`
            : `Reply to ${message.sender_name} by email, ${message.sender_email}`}
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={MAX_REPLY_CHARACTERS}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
            {channel === 'in-app' ? 'Send in Green Tag' : 'Send email'}
          </button>
          {channel === 'email' && (
            <a href={replyMailto(message, { officeName })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-800 hover:underline">
              <Reply size={14} aria-hidden="true" /> Or open my email app
            </a>
          )}
        </div>
      </form>
      {outcome && (
        <p role={outcome.ok ? 'status' : 'alert'} className={`text-xs ${outcome.ok ? 'text-green-800' : outcome.notSetUp ? 'text-amber-800' : 'text-red-700'}`}>
          {outcome.text}
        </p>
      )}
    </div>
  );
}

function MessageBody({ message, officeName, onChange, onDelete }) {
  const link = linkOf(message);
  const button = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold';
  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
      {message.kind === 'contact' && (
        <dl className="grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">From</dt>
          <dd>{message.sender_name} &lt;{message.sender_email}&gt;</dd>
          {message.sender_address && (
            <>
              <dt className="font-semibold">Address</dt>
              <dd>{message.sender_address}</dd>
            </>
          )}
          {message.sender_affiliation && (
            <>
              <dt className="font-semibold">Affiliation</dt>
              <dd>{message.sender_affiliation}</dd>
            </>
          )}
          <dt className="font-semibold">Sent</dt>
          <dd>{new Date(message.created_at).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}</dd>
        </dl>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{message.body}</p>
      {message.kind === 'contact' && <ReplyBox message={message} officeName={officeName} />}
      <div className="flex flex-wrap gap-2">
        {link && (
          <Link to={link.to} className={`${button} bg-white text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
            <MapPinned size={14} aria-hidden="true" /> {link.label}
          </Link>
        )}
        <button
          type="button"
          onClick={() => onChange(message.id, { archived_at: message.archived_at ? null : new Date().toISOString() })}
          className={`${button} bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}
        >
          {message.archived_at ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
          {message.archived_at ? 'Back to the inbox' : 'Archive'}
        </button>
        <button
          type="button"
          onClick={() => onChange(message.id, { read_at: null })}
          className={`${button} bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}
        >
          <Mail size={14} aria-hidden="true" /> Mark unread
        </button>
        <button type="button" onClick={() => onDelete(message)} className={`${button} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`}>
          <Trash2 size={14} aria-hidden="true" /> Delete
        </button>
      </div>
    </div>
  );
}
