import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { isMissingTable } from '../../lib/officeSettings.js';
import Section, { Outcome, buttonClass, inputClass } from './Section.jsx';

const when = (value) => (value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

/**
 * The office's own Gemini key (supabase/office_settings.sql). Saved into
 * Vault and never shown again — only its last four characters. Tested
 * without spending anything (supabase/functions/ai-key-test).
 */
export default function AiSection({ office, pgenro }) {
  const [setting, setSetting] = useState(undefined);
  const [missing, setMissing] = useState(false);
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState('');
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('office_ai_settings')
        .select('office, enabled, key_hint, updated_at')
        .eq('office', office)
        .maybeSingle();
      if (cancelled) return;
      setMissing(isMissingTable(error));
      setSetting(error ? null : (Array.isArray(data) ? data[0] : data) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [office]);

  const enabled = setting?.enabled ?? true;
  const hasKey = Boolean(setting?.key_hint);

  async function run(label, action) {
    setBusy(label);
    setOutcome(null);
    try {
      await action();
    } catch (failure) {
      setOutcome({ ok: false, text: failure.message });
    } finally {
      setBusy('');
    }
  }

  const save = () =>
    run('save', async () => {
      const { data, error } = await supabase.rpc('set_office_ai_key', { p_key: key.trim() });
      if (error) throw new Error(isMissingTable(error) ? 'AI keys need supabase/office_settings.sql, which has not been run yet.' : error.message);
      setSetting((current) => ({ ...current, office, enabled: current?.enabled ?? true, key_hint: data, updated_at: new Date().toISOString() }));
      setKey('');
      setReveal(false);
      setOutcome({ ok: true, text: 'Saved. It is kept encrypted, and only its last four characters are shown from now on.' });
    });

  const test = () =>
    run('test', async () => {
      const { data, error } = await supabase.functions.invoke('ai-key-test', { body: key.trim() ? { key: key.trim() } : {} });
      if (error) {
        throw new Error(
          /not found|404|Failed to send/i.test(error.message ?? '')
            ? 'The key test is not deployed yet: deploy supabase/functions/ai-key-test.'
            : error.message
        );
      }
      setOutcome(data?.ok ? { ok: true, text: `The key works — Gemini answered with ${data.models} models.` } : { ok: false, text: data?.error ?? 'The key did not work.' });
    });

  const remove = () =>
    run('remove', async () => {
      const { error } = await supabase.rpc('clear_office_ai_key');
      if (error) throw new Error(error.message);
      setSetting((current) => ({ ...current, key_hint: null }));
      setOutcome({ ok: true, text: pgenro ? 'Removed. The RISE reader uses the shared key again.' : 'Removed. The field app uses the shared key again.' });
    });

  const toggle = () =>
    run('toggle', async () => {
      const { error } = await supabase.rpc('set_office_ai_enabled', { p_enabled: !enabled });
      if (error) throw new Error(isMissingTable(error) ? 'AI settings need supabase/office_settings.sql.' : error.message);
      setSetting((current) => ({ ...current, office, enabled: !enabled }));
      setOutcome({ ok: true, text: enabled ? 'AI is off: nothing of this office is sent to Google.' : 'AI is on.' });
    });

  return (
    <Section title="AI" description={pgenro ? 'PGENRO’s own Gemini key, for the RISE reader' : 'This LGU’s own Gemini key, for the field app’s tree identification'}>
      {setting === undefined ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : (
        <div className="space-y-4">
          {missing && (
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              AI settings need supabase/office_settings.sql, which has not been run yet.
            </p>
          )}
          <p className="text-sm text-slate-600">
            {pgenro
              ? 'The RISE reader (Trees → Species) sends the PDF to Google’s Gemini with this key.'
              : 'The field app sends a tree’s leaf and bark photos to Google’s Gemini with this key, to suggest the species.'}{' '}
            Until a key is saved here the shared key is used. A key comes from Google AI Studio (aistudio.google.com → Get API key);
            its use is billed to the Google account that made it.
          </p>

          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
            <KeyRound size={18} className="text-slate-500" aria-hidden="true" />
            <p className="flex-1 text-sm text-slate-700">
              {hasKey ? (
                <>
                  Own key <span className="font-mono font-semibold">••••{setting.key_hint}</span>
                  {setting.updated_at && <span className="text-slate-500"> · saved {when(setting.updated_at)}</span>}
                </>
              ) : (
                'No key of its own yet — the shared key is used.'
              )}
            </p>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span>AI {enabled ? 'on' : 'off'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Use AI"
                onClick={toggle}
                disabled={Boolean(busy) || missing}
                className={`relative h-6 w-11 rounded-full transition ${enabled ? 'bg-green-600' : 'bg-slate-300'} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? 'left-[1.375rem]' : 'left-0.5'}`} />
              </button>
            </label>
          </div>

          <label className="block text-sm font-semibold text-slate-700">
            {hasKey ? 'Replace the key' : 'Gemini API key'}
            <span className="relative block">
              <input
                type={reveal ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="AIza…"
                className={`${inputClass} pr-10 font-mono`}
              />
              <button type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? 'Hide the key' : 'Show the key'}
                className="absolute right-2 top-1/2 -translate-y-[40%] rounded p-1 text-slate-400 hover:text-slate-700">
                {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={!key.trim() || Boolean(busy) || missing}
              className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
              {busy === 'save' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Save key
            </button>
            <button type="button" onClick={test} disabled={(!key.trim() && !hasKey) || Boolean(busy)}
              className={`${buttonClass} bg-amber-400 text-slate-900 hover:bg-amber-300`}>
              {busy === 'test' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Test {key.trim() ? 'this key' : 'saved key'}
            </button>
            {hasKey && (
              <button type="button" onClick={remove} disabled={Boolean(busy)}
                className={`${buttonClass} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`}>
                {busy === 'remove' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                Remove key
              </button>
            )}
          </div>
          <Outcome outcome={outcome} />
        </div>
      )}
    </Section>
  );
}
