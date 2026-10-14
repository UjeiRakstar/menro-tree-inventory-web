// Green Tag: read a DENR-ERDB RISE publication and fill in the species form.
//
// TEMPORARY. This exists to help the PGENRO forester encode a backlog of RISE
// issues quickly, and is meant to be removed afterwards. Everything about it
// is in three places — this function, src/components/pgenro/RiseAutofill.jsx,
// and the one line in SpeciesEditor.jsx that shows it — so removing it is
// deleting those and this function from the Supabase dashboard. The species
// form itself stays; typing into it works without any of this.
//
// What it does: the forester picks a RISE PDF; the website sends it here; this
// sends it to Google's Gemini with a list of the fields wanted, and returns
// what Gemini read. Nothing is saved here. The website puts the answer in the
// form, marks every field that came from it, and the forester checks each one
// before saving. RISE issues are public DENR publications, and sending them to
// Google was agreed on 14 October.
//
// The Gemini key lives in a Supabase secret, never in the website:
//
//   DEPLOY: Supabase dashboard → Edge Functions → Secrets → add GEMINI_API_KEY
//   (the same key the field app has in its .env). Then Deploy a new function →
//   name it `rise-extract` → paste this file. SUPABASE_URL and
//   SUPABASE_ANON_KEY are provided automatically.
//
// Request (POST, with the caller's own session in the Authorization header):
//   { "pdf": "<base64 of the PDF>", "file_name": "RISE-narra.pdf" }
// Reply:
//   { "citation": "...", "species": [ { "species": "Narra", ... }, ... ], "model": "..." }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// The field app's chain: the most accurate model first, a lighter one if it is
// overloaded or slow. A long PDF takes a while, so the limits are generous —
// but together under the 150 seconds Supabase gives a function to answer.
const MODELS: Array<[string, number]> = [
  ['gemini-3.6-flash', 75_000],
  ['gemini-3.5-flash-lite', 60_000],
];

// Base64 of an 8 MB PDF; the website refuses bigger files before sending.
const MAX_BASE64_LENGTH = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 4;

const text = (description: string) => ({ type: 'STRING', description });
const months = (description: string) => ({
  type: 'ARRAY',
  description: `${description} As month numbers, 1 = January … 12 = December. Empty if the issue does not say.`,
  items: { type: 'INTEGER' },
});

// The same keys as RISE_FIELDS in src/lib/riseFields.js.
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    citation: text('The issue itself: series, volume, number and year, e.g. "RISE Vol. 21 No. 2 (2019)".'),
    species: {
      type: 'ARRAY',
      description: 'One entry per tree species the issue profiles. Usually one.',
      items: {
        type: 'OBJECT',
        properties: {
          species: text('The common name in the Philippines, e.g. "Narra".'),
          scientific_name: text('Genus, species and author as printed.'),
          family: text('Botanical family.'),
          local_names: text('Other local or vernacular names, comma-separated.'),
          conservation_status: text('Conservation status as stated, with its source (e.g. DAO 2017-11, IUCN).'),
          description: text('Botanical description: form, size, bark, leaves, flowers, fruit.'),
          distribution: text('Where it occurs, in the Philippines and beyond, and its habitat.'),
          site_requirements: text('Elevation, climate, rainfall, temperature and soil it needs.'),
          flowering_months: months('When it flowers.'),
          fruiting_months: months('When it fruits or its fruits mature.'),
          phenology_note: text('What the issue says about flowering and fruiting, in its own words.'),
          propagation: text('Seed collection, processing, storage, germination, nursery and planting.'),
          uses: text('Uses: wood, food, medicine, ornamental, ecological.'),
          pests_diseases: text('Pests and diseases, and their control.'),
        },
        required: ['species'],
      },
    },
  },
  required: ['species'],
};

const PROMPT = `This PDF is an issue of RISE (Research Information Series on Ecosystems), published by the Ecosystems Research and Development Bureau (ERDB) of the Philippine Department of Environment and Natural Resources.

Read it and fill in the fields for each tree species it profiles.

Rules:
- Use only what the publication says. Do not add facts from elsewhere, even if you know them.
- Keep the publication's wording where you can; summarise only when a section is very long.
- If the publication does not cover a field, leave it as an empty string (or an empty list for months).
- Separate paragraphs with a blank line. No markdown, no bullet characters.`;

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function ask(model: string, timeoutMs: number, key: string, pdf: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ inline_data: { mime_type: 'application/pdf', data: pdf } }, { text: PROMPT }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
          },
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`${model} answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const body = await response.json();
    const answer = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('');
    if (!answer) throw new Error(`${model} returned nothing to read.`);
    return JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });

  // Who is asking — read as THEM, so the database's own rules decide. Only
  // PGENRO keeps the species write-ups, so only PGENRO may spend the key.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const { data: isPgenro, error: roleError } = await asCaller.rpc('is_pgenro');
  if (roleError || isPgenro !== true) {
    return reply(403, { error: 'Only an active PGENRO account can read RISE publications here.' });
  }

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) {
    return reply(500, {
      error: 'GEMINI_API_KEY is not set. Add it under Edge Functions → Secrets in the Supabase dashboard.',
    });
  }

  let body: { pdf?: string; file_name?: string };
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'The request was not JSON.' });
  }
  const pdf = String(body.pdf ?? '').replace(/^data:[^,]*,/, '');
  if (!pdf) return reply(400, { error: 'No PDF was sent.' });
  if (pdf.length > MAX_BASE64_LENGTH) return reply(413, { error: 'That PDF is over 8 MB.' });
  // Every PDF starts "%PDF", which is "JVBERi" in base64.
  if (!pdf.startsWith('JVBERi')) return reply(400, { error: 'That file is not a PDF.' });

  const failures: string[] = [];
  for (const [model, timeoutMs] of MODELS) {
    try {
      const result = await ask(model, timeoutMs, key, pdf);
      return reply(200, { ...result, model });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return reply(502, { error: `Gemini could not read it. ${failures.join(' | ')}` });
});
