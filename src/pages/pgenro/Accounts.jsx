import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  LockOpen,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { logoFor } from '../../lib/lguLogos.js';
import { ROLES, SEAT_LIMIT, STATUS, codeState, roleLabel, seatsTaken } from '../../lib/roles.js';

/**
 * PGENRO's view of every LGU account in the province.
 *
 * Thirty cities and municipalities, each with up to five admin seats. Each row
 * shows who holds them, which codes are still out, and what PGENRO can do
 * about either. Nothing here deletes anybody: an officer who leaves is
 * archived, and their name stays on everything they recorded.
 *
 * Every action goes through the database's own functions
 * (supabase/accounts.sql), which check that the caller really is PGENRO and
 * write the activity log. This page only decides what to offer.
 */

const STATUS_STYLE = {
  [STATUS.ACTIVE]: 'bg-green-100 text-green-800',
  [STATUS.LOCKED]: 'bg-amber-100 text-amber-800',
  [STATUS.ARCHIVED]: 'bg-slate-200 text-slate-600',
};

const STATUS_LABEL = {
  [STATUS.ACTIVE]: 'Active',
  [STATUS.LOCKED]: 'Locked',
  [STATUS.ARCHIVED]: 'Archived',
};

const MIN_PASSWORD_LENGTH = 10;

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

/** The server function's answer, read the same way whatever went wrong. */
async function callManageAccount(body) {
  const { data, error } = await supabase.functions.invoke('manage-account', { body });
  if (error) {
    // Not deployed yet is the likeliest failure, and the one worth naming.
    const missing = /not found|404|failed to send/i.test(error.message ?? '');
    return {
      ok: false,
      message: missing
        ? 'This needs the manage-account server function, which has not been deployed yet. See ACCOUNTS_AND_MAPPING.md.'
        : error.message,
    };
  }
  if (data?.error) return { ok: false, message: data.error };
  return { ok: true };
}

/** A small modal: title, body, and a way out that is always visible. */
function Dialog({ title, onClose, children }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="accounts-dialog-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <h2 id="accounts-dialog-title" className="flex-1 text-base font-bold text-slate-900">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/**
 * Issuing a code. The plain code exists only in this dialog: the database keeps
 * a hash. Lose it, revoke it, issue another.
 */
function IssueCodeDialog({ lgu, onClose, onIssued }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleIssue(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('issue_account_code', {
      p_lgu: lgu.psgc,
      p_note: note.trim() || null,
    });
    setBusy(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (rpcError || !row?.code) {
      setError(rpcError?.message ?? 'The code could not be issued.');
      return;
    }
    setIssued(row);
    onIssued();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      // The code is on screen and selectable; copying is a convenience.
    }
  }

  return (
    <Dialog title={issued ? 'Account code issued' : `New account code — ${lgu.label}`} onClose={onClose}>
      {issued ? (
        <div>
          <p className="text-sm text-slate-600">
            This sets up one {roleLabel(ROLES.LGU_ADMIN, { isCity: lgu.is_city })} account for{' '}
            <strong>{lgu.label}</strong>.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-green-300 bg-green-50 px-4 py-3">
            <code className="flex-1 select-all font-mono text-xl font-bold tracking-widest text-green-900">
              {issued.code}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-green-800 ring-1 ring-green-200 hover:bg-green-100"
            >
              <Copy size={13} aria-hidden="true" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
            <strong>This is the only time this code is shown.</strong> Only a scrambled copy is kept,
            so not even PGENRO can look it up later. It works once, until{' '}
            {formatDate(issued.expires_at)}. The officer enters it at <strong>Log In → Have an
            account code?</strong>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-800"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleIssue}>
          <label htmlFor="issue-note" className="block text-sm font-medium text-slate-700">
            Who is it for? <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="issue-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Juan dela Cruz, MENRO officer"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
          <p className="mt-1 text-xs text-slate-500">
            So that a code still out can be traced to whoever it was meant for.
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50"
          >
            {busy ? 'Issuing…' : 'Issue code'}
          </button>
        </form>
      )}
    </Dialog>
  );
}

/** Changing an officer's email or password — the two that need the server function. */
function CredentialDialog({ kind, account, onClose, onDone }) {
  const [value, setValue] = useState(kind === 'email' ? account.email ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (kind === 'password' && value.length < MIN_PASSWORD_LENGTH) {
      setError(`A password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError('');
    const result = await callManageAccount(
      kind === 'email'
        ? { action: 'set_email', user_id: account.id, email: value.trim() }
        : { action: 'set_password', user_id: account.id, password: value }
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone(kind === 'email' ? 'Email updated.' : 'Password changed. Tell the officer in person.');
  }

  return (
    <Dialog
      title={kind === 'email' ? `Update email — ${account.full_name || account.email}` : `Change password — ${account.full_name || account.email}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor="credential-value" className="block text-sm font-medium text-slate-700">
          {kind === 'email' ? 'New email address' : 'New password'}
        </label>
        <input
          id="credential-value"
          type={kind === 'email' ? 'email' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
          required
        />
        <p className="mt-1 text-xs text-slate-500">
          {kind === 'email'
            ? 'They sign in with this from now on. No confirmation email is sent — PGENRO is vouching for it.'
            : 'For an officer locked out of their email. Otherwise, a reset email is safer: they choose the password and nobody else sees it.'}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {busy ? 'Saving…' : kind === 'email' ? 'Update email' : 'Change password'}
        </button>
      </form>
    </Dialog>
  );
}

/** Lock or archive, said plainly before it happens. */
const STATUS_CONFIRM = {
  [STATUS.LOCKED]: {
    title: 'Lock this account?',
    body: 'They are signed out and cannot sign in or change anything until you unlock it. Everything they recorded stays. They keep their seat.',
    action: 'Lock account',
  },
  [STATUS.ARCHIVED]: {
    title: 'Archive this account?',
    body: 'For someone who has left. They cannot sign in, their seat is freed for someone new, and their name stays on everything they recorded. You can restore it later if a seat is free.',
    action: 'Archive account',
  },
  [STATUS.ACTIVE]: {
    title: 'Restore this account?',
    body: 'They can sign in and work again.',
    action: 'Restore account',
  },
};

function StatusDialog({ account, next, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = STATUS_CONFIRM[next];

  async function handleConfirm() {
    setBusy(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('set_account_status', {
      p_user: account.id,
      p_status: next,
    });
    if (rpcError) {
      setBusy(false);
      setError(rpcError.message);
      return;
    }

    // The database already stops a locked account writing. Ending its open
    // sessions needs the server function; if that is not deployed yet the
    // lock still holds, and the page says how much of it took.
    const signOut = await callManageAccount({
      action: next === STATUS.ACTIVE ? 'allow_sign_in' : 'sign_out',
      user_id: account.id,
    });
    setBusy(false);
    onDone(
      signOut.ok
        ? `${STATUS_LABEL[next]}.`
        : `${STATUS_LABEL[next]}. Any session they already had open stays until it expires, because the manage-account server function is not deployed — but it can no longer change anything.`
    );
  }

  return (
    <Dialog title={copy.title} onClose={onClose}>
      <p className="text-sm font-semibold text-slate-800">{account.full_name || account.email}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy.body}</p>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
            next === STATUS.ACTIVE ? 'bg-green-700 hover:bg-green-800' : 'bg-amber-700 hover:bg-amber-800'
          }`}
        >
          {busy ? 'Working…' : copy.action}
        </button>
      </div>
    </Dialog>
  );
}

/** One admin, and what PGENRO can do to their account. */
function AccountRow({ account, isCity, onAction }) {
  const status = account.status ?? STATUS.ACTIVE;
  const button =
    'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900';

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{account.full_name || 'No name given'}</p>
        <p className="truncate text-xs text-slate-500">
          {account.email} · {roleLabel(account.role, { isCity, short: true })}
        </p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[status]}`}>
        {STATUS_LABEL[status]}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {status !== STATUS.ARCHIVED && (
          <button type="button" className={button} onClick={() => onAction('reset', account)}>
            <Mail size={12} aria-hidden="true" /> Reset password
          </button>
        )}
        {status !== STATUS.ARCHIVED && (
          <button type="button" className={button} onClick={() => onAction('password', account)}>
            <KeyRound size={12} aria-hidden="true" /> Change password
          </button>
        )}
        {status !== STATUS.ARCHIVED && (
          <button type="button" className={button} onClick={() => onAction('email', account)}>
            <Mail size={12} aria-hidden="true" /> Update email
          </button>
        )}
        {status === STATUS.ACTIVE && (
          <button type="button" className={button} onClick={() => onAction(STATUS.LOCKED, account)}>
            <Lock size={12} aria-hidden="true" /> Lock
          </button>
        )}
        {status === STATUS.LOCKED && (
          <button type="button" className={button} onClick={() => onAction(STATUS.ACTIVE, account)}>
            <LockOpen size={12} aria-hidden="true" /> Unlock
          </button>
        )}
        {status !== STATUS.ARCHIVED ? (
          <button type="button" className={button} onClick={() => onAction(STATUS.ARCHIVED, account)}>
            <Archive size={12} aria-hidden="true" /> Archive
          </button>
        ) : (
          <button type="button" className={button} onClick={() => onAction(STATUS.ACTIVE, account)}>
            <RotateCcw size={12} aria-hidden="true" /> Restore
          </button>
        )}
      </div>
    </li>
  );
}

/** One city or municipality: its seats, its admins, its codes still out. */
function LguCard({ lgu, admins, codes, fieldOfficers, now, onIssue, onRevoke, onAction }) {
  const taken = seatsTaken({ admins, codes }, now);
  const full = taken >= SEAT_LIMIT;
  const outstanding = codes.filter((code) => codeState(code, now) === 'outstanding');
  const logo = logoFor(lgu.name);

  return (
    <section
      aria-label={lgu.label}
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        {logo && <img src={logo} alt="" aria-hidden="true" className="h-10 w-10 rounded-full object-contain" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">{lgu.label}</h2>
          <p className="text-xs text-slate-500">
            {roleLabel(ROLES.LGU_ADMIN, { isCity: lgu.is_city })} · {fieldOfficers}{' '}
            {fieldOfficers === 1 ? 'field officer' : 'field officers'}
          </p>
        </div>
        {/* Seats as a count AND as marks, so the number is not the only cue. */}
        <div className="text-right">
          <p className={`text-sm font-bold ${full ? 'text-amber-700' : 'text-slate-700'}`}>
            {taken} of {SEAT_LIMIT} seats
          </p>
          <div className="mt-1 flex justify-end gap-1" aria-hidden="true">
            {Array.from({ length: SEAT_LIMIT }, (_, i) => (
              <span key={i} className={`h-1.5 w-4 rounded-full ${i < taken ? 'bg-green-600' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onIssue(lgu)}
          disabled={full}
          title={full ? 'All five seats are taken. Archive an account or revoke a code to free one.' : undefined}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-3 py-2 text-xs font-bold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <KeyRound size={14} aria-hidden="true" /> Issue code
        </button>
      </div>

      {admins.length > 0 ? (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {admins.map((account) => (
            <AccountRow key={account.id} account={account} isCity={lgu.is_city} onAction={onAction} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          No admin account set up yet.
        </p>
      )}

      {outstanding.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Codes not yet used</p>
          <ul className="mt-1 space-y-1">
            {outstanding.map((code) => (
              <li key={code.id} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="flex-1">
                  {code.note || 'No note'} · issued {formatDate(code.issued_at)} · expires{' '}
                  {formatDate(code.expires_at)}
                </span>
                <button
                  type="button"
                  onClick={() => onRevoke(code)}
                  className="font-medium text-red-700 hover:text-red-800"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** What PGENRO "monitors": the last things anybody did, newest first. */
function ActivityLog({ entries, lgusByPsgc }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">Nothing recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">When</th>
            <th className="px-3 py-2 font-semibold">Who</th>
            <th className="px-3 py-2 font-semibold">LGU</th>
            <th className="px-3 py-2 font-semibold">What</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatDateTime(entry.at)}</td>
              <td className="px-3 py-2 text-slate-700">{entry.actor_email ?? 'system'}</td>
              <td className="px-3 py-2 text-slate-600">{lgusByPsgc.get(entry.lgu_psgc)?.label ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{entry.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Accounts() {
  const [lgus, setLgus] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [codes, setCodes] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('lgus');
  const [notice, setNotice] = useState('');
  // Which dialog is open: { kind, lgu?, account?, next? }.
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    const [lgusResult, profilesResult, codesResult, logResult] = await Promise.all([
      supabase.from('lgus').select('psgc, name, label, is_city, short_code').order('label'),
      supabase
        .from('profiles')
        .select('id, email, full_name, role, lgu_psgc, status, is_approved')
        .order('full_name'),
      supabase
        .from('account_codes')
        .select('id, lgu_psgc, note, issued_at, expires_at, redeemed_at, revoked_at')
        .order('issued_at', { ascending: false }),
      supabase
        .from('activity_log')
        .select('id, at, actor_email, actor_role, lgu_psgc, action, entity, entity_id')
        .order('at', { ascending: false })
        .limit(100),
    ]);

    const failed = [lgusResult, profilesResult, codesResult].find((result) => result.error);
    if (failed) {
      // The likeliest reason by far: accounts.sql has not been run yet.
      setLoadError(
        /relation .* does not exist|could not find the table/i.test(failed.error.message)
          ? 'The accounts tables are not in the database yet. Run supabase/accounts.sql in the Supabase SQL editor, then reload.'
          : failed.error.message
      );
      setLoading(false);
      return;
    }

    setLgus(lgusResult.data ?? []);
    setProfiles(profilesResult.data ?? []);
    setCodes(codesResult.data ?? []);
    setLog(logResult.error ? [] : logResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = useMemo(() => new Date(), [codes, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const lgusByPsgc = useMemo(() => new Map(lgus.map((lgu) => [lgu.psgc, lgu])), [lgus]);

  const byLgu = useMemo(() => {
    const groups = new Map(lgus.map((lgu) => [lgu.psgc, { admins: [], codes: [], fieldOfficers: 0 }]));
    for (const profile of profiles) {
      const group = groups.get(profile.lgu_psgc);
      if (!group) continue;
      if (profile.role === ROLES.LGU_ADMIN) group.admins.push(profile);
      else if (profile.role === ROLES.FIELD_OFFICER && profile.status !== STATUS.ARCHIVED) {
        group.fieldOfficers += 1;
      }
    }
    for (const code of codes) groups.get(code.lgu_psgc)?.codes.push(code);
    return groups;
  }, [lgus, profiles, codes]);

  const pgenroAccounts = profiles.filter((profile) => profile.role === ROLES.PGENRO);

  const shown = lgus.filter((lgu) => lgu.label.toLowerCase().includes(query.trim().toLowerCase()));

  const totals = useMemo(() => {
    let admins = 0;
    let outstanding = 0;
    for (const group of byLgu.values()) {
      admins += group.admins.filter((admin) => admin.status !== STATUS.ARCHIVED).length;
      outstanding += group.codes.filter((code) => codeState(code, now) === 'outstanding').length;
    }
    const withNone = [...byLgu.values()].filter(
      (group) => group.admins.filter((admin) => admin.status === STATUS.ACTIVE).length === 0
    ).length;
    return { admins, outstanding, withNone };
  }, [byLgu, now]);

  function finish(message) {
    setDialog(null);
    setNotice(message);
    load();
  }

  async function handleAction(kind, account) {
    if (kind === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(account.email, {
        redirectTo: `${window.location.origin}/login`,
      });
      setNotice(error ? error.message : `A password reset email is on its way to ${account.email}.`);
      return;
    }
    if (kind === 'email' || kind === 'password') {
      setDialog({ kind, account });
      return;
    }
    setDialog({ kind: 'status', account, next: kind });
  }

  async function handleRevoke(code) {
    const { error } = await supabase.rpc('revoke_account_code', { p_id: code.id });
    finish(error ? error.message : 'Code revoked. Its seat is free again.');
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-600" role="status">
        <Loader2 size={16} className="animate-spin text-green-700" aria-hidden="true" /> Loading accounts…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldCheck className="text-green-700" size={24} aria-hidden="true" /> Accounts
          </h1>
          {!loadError && (
            <p className="mt-1 text-sm text-slate-500">
              {lgus.length} cities and municipalities · {totals.admins} admin accounts ·{' '}
              {totals.outstanding} codes not yet used
              {totals.withNone > 0 && (
                <>
                  {' '}· <span className="font-semibold text-amber-700">{totals.withNone} with no active admin</span>
                </>
              )}
            </p>
          )}
        </div>
      </header>

      {loadError && (
        <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </p>
      )}

      {notice && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss" className="text-green-700">
            <X size={16} />
          </button>
        </p>
      )}

      {!loadError && (
        <>
          <div role="tablist" aria-label="Accounts views" className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1">
            {[
              ['lgus', 'LGU accounts'],
              ['log', 'Activity log'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  tab === id ? 'bg-white text-green-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'lgus' ? (
            <div role="tabpanel" className="mt-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a city or municipality"
                  aria-label="Find a city or municipality"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>

              {pgenroAccounts.length > 0 && !query && (
                <section aria-label="PGENRO" className="rounded-2xl border border-green-200 bg-green-50/50 p-4 sm:p-5">
                  <h2 className="text-base font-bold text-slate-900">PGENRO — Province of Laguna</h2>
                  <ul className="mt-2 divide-y divide-green-100">
                    {pgenroAccounts.map((account) => (
                      <li key={account.id} className="py-2 text-sm">
                        <span className="font-semibold text-slate-800">{account.full_name || account.email}</span>{' '}
                        <span className="text-xs text-slate-500">{account.email}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {shown.map((lgu) => {
                const group = byLgu.get(lgu.psgc) ?? { admins: [], codes: [], fieldOfficers: 0 };
                return (
                  <LguCard
                    key={lgu.psgc}
                    lgu={lgu}
                    admins={group.admins}
                    codes={group.codes}
                    fieldOfficers={group.fieldOfficers}
                    now={now}
                    onIssue={(target) => setDialog({ kind: 'issue', lgu: target })}
                    onRevoke={handleRevoke}
                    onAction={handleAction}
                  />
                );
              })}
              {shown.length === 0 && <p className="text-sm text-slate-500">No city or municipality matches “{query}”.</p>}
            </div>
          ) : (
            <div role="tabpanel" className="mt-4">
              <p className="mb-3 text-xs text-slate-500">
                The last 100 things anyone did — accounts, codes and changes to the inventory. Written by
                the database as each happens, so nothing skips it.
              </p>
              <ActivityLog entries={log} lgusByPsgc={lgusByPsgc} />
            </div>
          )}
        </>
      )}

      {dialog?.kind === 'issue' && (
        <IssueCodeDialog lgu={dialog.lgu} onClose={() => setDialog(null)} onIssued={load} />
      )}
      {(dialog?.kind === 'email' || dialog?.kind === 'password') && (
        <CredentialDialog kind={dialog.kind} account={dialog.account} onClose={() => setDialog(null)} onDone={finish} />
      )}
      {dialog?.kind === 'status' && (
        <StatusDialog account={dialog.account} next={dialog.next} onClose={() => setDialog(null)} onDone={finish} />
      )}
    </div>
  );
}
