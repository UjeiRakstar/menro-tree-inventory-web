import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import Section, { Outcome, buttonClass, inputClass } from './Section.jsx';

/** PostgREST's "no such table": community.sql not run again since the list moved into one. */
const isMissingTable = (error) => /does not exist|Could not find the table/i.test(error?.message ?? '');

/**
 * The words a resident's nickname may not hold (supabase/community.sql,
 * 20 October): the built-in ones, which stay, and PGENRO's own additions,
 * which it can remove again. A word refused "anywhere" is caught inside other
 * words too; the rest only as a word of its own, so "Essex" passes where
 * "sex" does not. Numbers for letters and repeated letters are read through
 * ("b0b0", "fuuu…"). A box at the foot tries a nickname against the list.
 */
export default function NicknameWordsSection() {
  const [words, setWords] = useState(null);
  const [missing, setMissing] = useState(false);
  const [word, setWord] = useState('');
  const [anywhere, setAnywhere] = useState(false);
  const [busy, setBusy] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [trial, setTrial] = useState('');
  const [verdict, setVerdict] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('nickname_words').select('*').order('word');
      if (cancelled) return;
      setMissing(isMissingTable(error));
      setWords(error || !Array.isArray(data) ? [] : data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const own = (words ?? []).filter((w) => !w.built_in);
  const builtIn = (words ?? []).filter((w) => w.built_in);

  async function add(event) {
    event.preventDefault();
    const clean = word.trim().toLowerCase();
    setOutcome(null);
    if (!/^[a-z]{2,30}$/.test(clean)) {
      setOutcome({ ok: false, text: 'A word is 2 to 30 letters, a to z, with no spaces or numbers.' });
      return;
    }
    if ((words ?? []).some((w) => w.word === clean)) {
      setOutcome({ ok: false, text: `"${clean}" is on the list already.` });
      return;
    }
    setBusy('add');
    const { data, error } = await supabase.from('nickname_words').insert({ word: clean, anywhere }).select().single();
    setBusy('');
    if (error) {
      setOutcome({ ok: false, text: isMissingTable(error) ? 'The list needs supabase/community.sql to be run again.' : error.message });
      return;
    }
    setWords((current) => [...(current ?? []), data ?? { word: clean, anywhere, built_in: false }].sort((a, b) => a.word.localeCompare(b.word)));
    setWord('');
    setOutcome({ ok: true, text: `"${clean}" added. Nicknames holding it are refused from now on; ones already chosen stay.` });
  }

  async function remove(entry) {
    setBusy(entry.word);
    setOutcome(null);
    const { error } = await supabase.from('nickname_words').delete().eq('word', entry.word);
    setBusy('');
    if (error) {
      setOutcome({ ok: false, text: error.message });
      return;
    }
    setWords((current) => current.filter((w) => w.word !== entry.word));
    setOutcome({ ok: true, text: `"${entry.word}" removed.` });
  }

  async function check(event) {
    event.preventDefault();
    if (!trial.trim()) return;
    setBusy('check');
    const { data, error } = await supabase.rpc('nickname_problem', { p_nickname: trial });
    setBusy('');
    setVerdict(error ? { ok: false, text: error.message } : data ? { ok: false, text: `Refused: ${data}` } : { ok: true, text: 'Allowed.' });
  }

  const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs';
  return (
    <Section title="Nicknames" description="The words a resident's nickname may not hold — built in, and PGENRO's own">
      {missing && (
        <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          The list needs supabase/community.sql to be run again.
        </p>
      )}
      {words === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : (
        <div className="space-y-4">
          <form onSubmit={add} className="flex flex-wrap items-end gap-3" aria-label="Add a word">
            <label className="block text-sm font-semibold text-slate-700">
              Word
              <input value={word} onChange={(event) => setWord(event.target.value)} maxLength={30} className={inputClass} placeholder="e.g. a slur, in any language" />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={anywhere} onChange={(event) => setAnywhere(event.target.checked)} />
              Also inside other words
            </label>
            <button type="submit" disabled={Boolean(busy)} className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
              {busy === 'add' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
              Add
            </button>
          </form>
          <p className="text-xs text-slate-500">
            Leave &ldquo;inside other words&rdquo; off for a short word that is often part of a name, so a name like Essex still
            passes when &ldquo;sex&rdquo; is refused.
          </p>

          <div>
            <h3 className="text-sm font-bold text-slate-800">Added by PGENRO ({own.length})</h3>
            {own.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Words added by PGENRO">
                {own.map((entry) => (
                  <li key={entry.word} className={`${chip} bg-amber-50 text-amber-900 ring-1 ring-amber-200`}>
                    {entry.word}
                    {entry.anywhere && <span className="text-[10px] text-amber-700">anywhere</span>}
                    <button type="button" onClick={() => remove(entry)} disabled={Boolean(busy)} aria-label={`Remove ${entry.word}`}
                      className="rounded-full p-0.5 hover:bg-amber-100">
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details className="rounded-xl bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">The {builtIn.length} words built in</summary>
            <p className="mt-2 text-xs text-slate-500">Lewd, abusive and slurring words in English and Filipino, and names that pass for an office. They stay on the list.</p>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Built-in words">
              {builtIn.map((entry) => (
                <li key={entry.word} className={`${chip} bg-white text-slate-600 ring-1 ring-slate-200`}>{entry.word}</li>
              ))}
            </ul>
          </details>

          <form onSubmit={check} className="flex flex-wrap items-end gap-3" aria-label="Check a nickname against the list">
            <label className="block text-sm font-semibold text-slate-700">
              Try a nickname
              <input value={trial} onChange={(event) => { setTrial(event.target.value); setVerdict(null); }} maxLength={40} className={inputClass} />
            </label>
            <button type="submit" disabled={Boolean(busy) || !trial.trim()} className={`${buttonClass} text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
              {busy === 'check' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Check
            </button>
            {verdict && <p role="status" className={`pb-2 text-sm ${verdict.ok ? 'text-green-800' : 'text-red-700'}`}>{verdict.text}</p>}
          </form>
          <Outcome outcome={outcome} />
        </div>
      )}
    </Section>
  );
}
