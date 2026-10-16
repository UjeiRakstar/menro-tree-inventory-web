// Green Tag: does an office's Gemini key work? — the Test API key button in
// Settings.
//
// With { "key": "..." } it tries that key, before it is saved; with no key it
// tries the one the office already saved (office_settings.sql), which no page
// can read back. Either way it only lists Gemini's models: nothing is
// generated, and nothing is spent.
//
//   DEPLOY: Supabase dashboard → Edge Functions → Deploy a new function →
//   name it `ai-key-test` → paste this file → Deploy.
//
// Reply: { "ok": true, "models": 12 } or { "ok": false, "error": "..." }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'POST only.' });

  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const { data: office, error } = await asCaller.rpc('my_document_folder');
  if (error || !office) return reply(403, { ok: false, error: 'Only an office account tests an AI key.' });

  let body: { key?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body: test the saved key.
  }
  let key = String(body.key ?? '').trim();
  if (!key) {
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await service.rpc('office_ai_key', { p_office: String(office) });
    key = data ? String(data) : '';
    if (!key) return reply(200, { ok: false, error: 'No key is saved yet — or AI is switched off.' });
  }

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=50', {
    headers: { 'x-goog-api-key': key },
  });
  if (!response.ok) {
    const text = await response.text();
    const message = /API_KEY_INVALID|API key not valid/i.test(text)
      ? 'Google says this key is not valid.'
      : response.status === 403
        ? 'Google refused this key: the Generative Language API may not be enabled for its project.'
        : `Google answered ${response.status}.`;
    return reply(200, { ok: false, error: message });
  }
  const json = await response.json();
  return reply(200, { ok: true, models: Array.isArray(json.models) ? json.models.length : 0 });
});
