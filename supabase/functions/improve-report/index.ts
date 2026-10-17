// Green Tag: improve the wording of a map sheet's written report — the
// "Improve with AI" button on the Report tab.
//
// The report is written by the system from the figures (src/lib/reportWriter.js),
// so its facts are right but its sentences are plain. This asks Gemini to
// rewrite each section as a planning document would say it, keeping every
// figure, name and claim and adding none. The office reads the result before
// it uses it: the button only proposes.
//
// The key is the office's own, set in Settings (office_settings.sql), or the
// shared GEMINI_API_KEY secret; an office that switched AI off is refused.
//
//   DEPLOY: Supabase dashboard → Edge Functions → Deploy a new function →
//   name it `improve-report` → paste this file → Deploy.
//
// Request (POST, with the office's session): { "place": "Municipality of Santa Cruz",
//   "sections": [{ "key", "heading", "text" }] }
// Reply: { "sections": [{ "key", "text" }], "model" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODELS: Array<[string, number]> = [
  ['gemini-3.6-flash', 60_000],
  ['gemini-3.5-flash-lite', 40_000],
];

const MAX_CHARACTERS = 40_000;

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { key: { type: 'STRING' }, text: { type: 'STRING' } },
        required: ['key', 'text'],
      },
    },
  },
  required: ['sections'],
};

const prompt = (place: string, sections: Array<{ key: string; heading: string; text: string }>) =>
  `You are editing a section-by-section report for the ${place}, Laguna, Philippines, prepared by its environment office to support its Forest Land Use Plan, Comprehensive Land Use Plan and Comprehensive Development Plan.

Rewrite the text of each section in clear, formal English as a Philippine local government planning document would put it.

Rules — all of them, strictly:
- Keep every number, percentage, name, species, barangay and date exactly as given.
- Do not add any fact, figure, cause, comparison or claim that is not in the text.
- Do not remove any fact.
- Keep each section's meaning; you may join or split sentences, but not move facts between sections.
- No markdown, no bullet characters. Separate paragraphs with a blank line.
- Return every section, with its key unchanged.

The sections, as JSON:
${JSON.stringify(sections.map(({ key, heading, text }) => ({ key, heading, text })))}`;

async function ask(model: string, timeoutMs: number, key: string, text: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
    if (!response.ok) throw new Error(`${model} answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const body = await response.json();
    const answer = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';
    return JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });

  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const { data: office, error } = await asCaller.rpc('my_document_folder');
  if (error || !office) return reply(403, { error: 'Only an office account writes reports.' });

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const [own, enabled] = await Promise.all([
    service.rpc('office_ai_key', { p_office: String(office) }),
    service.rpc('office_ai_enabled', { p_office: String(office) }),
  ]);
  if (!enabled.error && enabled.data === false) {
    return reply(403, { error: 'AI is switched off in this office’s Settings.' });
  }
  const key = (!own.error && own.data) || Deno.env.get('GEMINI_API_KEY');
  if (!key) return reply(500, { error: 'No Gemini key: add one in Settings.' });

  let body: { place?: string; sections?: Array<{ key: string; heading: string; text: string }> };
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'The request was not JSON.' });
  }
  const sections = Array.isArray(body.sections) ? body.sections.filter((s) => s && s.key && typeof s.text === 'string') : [];
  if (sections.length === 0) return reply(400, { error: 'No sections were sent.' });
  if (sections.reduce((total, s) => total + s.text.length, 0) > MAX_CHARACTERS) return reply(413, { error: 'The report is too long.' });

  const failures: string[] = [];
  for (const [model, timeoutMs] of MODELS) {
    try {
      const result = await ask(model, timeoutMs, String(key), prompt(String(body.place ?? 'LGU'), sections));
      const byKey = new Map((result?.sections ?? []).map((s: { key: string; text: string }) => [s.key, s.text]));
      // Only the sections sent come back, each with its own key.
      return reply(200, {
        sections: sections.map((s) => ({ key: s.key, text: String(byKey.get(s.key) ?? s.text) })),
        model,
      });
    } catch (failure) {
      failures.push(failure instanceof Error ? failure.message : String(failure));
    }
  }
  return reply(502, { error: `The AI could not answer: ${failures.join(' | ')}` });
});
