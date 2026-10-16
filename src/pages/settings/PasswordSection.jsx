import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import Section, { Outcome, buttonClass, inputClass } from './Section.jsx';

export const MIN_PASSWORD = 8;

/** This account's own password. */
export default function PasswordSection() {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);

  async function update(event) {
    event.preventDefault();
    setOutcome(null);
    if (password.length < MIN_PASSWORD) {
      setOutcome({ ok: false, text: `A password is at least ${MIN_PASSWORD} characters.` });
      return;
    }
    if (password !== again) {
      setOutcome({ ok: false, text: 'The two passwords are not the same.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setOutcome({
        ok: false,
        text: /reauth|recent/i.test(error.message ?? '')
          ? 'For safety, sign out and in again, then change the password.'
          : error.message,
      });
      return;
    }
    setPassword('');
    setAgain('');
    setOutcome({ ok: true, text: 'Password updated. Use it the next time you sign in.' });
  }

  return (
    <Section title="Password" description="This account’s own password">
      <form onSubmit={update} className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          New password
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          The same again
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={inputClass} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={busy || !password} className={`${buttonClass} bg-amber-400 text-slate-900 hover:bg-amber-300`}>
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            Update password
          </button>
          <Outcome outcome={outcome} />
        </div>
      </form>
    </Section>
  );
}
