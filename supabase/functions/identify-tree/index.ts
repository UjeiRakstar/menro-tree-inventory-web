// Green Tag: identify a tree from the field app's photos — with the officer's
// own LGU's Gemini key.
//
// The field app used to carry a Gemini key inside it, where anyone with the
// app could take it out. It now sends the photos here instead, and this uses
// the key the officer's MENRO / CENRO set in Settings (office_settings.sql),
// so each LGU's AI use is its own and on its own key. Until an LGU has set
// one, the shared key in the Supabase secret GEMINI_API_KEY is used, so
// nothing stops working in between. An LGU that switched AI off in Settings
// is told so, and nothing is sent to Google.
//
// The question asked, the models tried and the answer's shape are the field
// app's own, moved here unchanged from lib/ai_service.dart.
//
//   DEPLOY: Supabase dashboard → Edge Functions → Deploy a new function →
//   name it `identify-tree` → paste this file → Deploy. SUPABASE_URL,
//   SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Request (POST, with the officer's session in the Authorization header):
//   { "leaves": "<base64 JPEG>", "bark": "<base64 JPEG>", "fruits": "<base64 JPEG, optional>" }
// Reply: the field app's result — { "status": "tree", "name", "scientificName",
//   "type", "category" } | { "status": "no_tree" } | { "status": "plant_not_tree",
//   "detectedPlant" } — plus "model" and "key": "office" | "shared".
//   Or { "status": "ai_off" } (403) when the LGU has switched AI off.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// The field app's chain: the most accurate model first, a lighter one if it
// is overloaded or slow.
const MODELS: Array<[string, number]> = [
  ['gemini-3.6-flash', 12_000],
  ['gemini-3.5-flash-lite', 20_000],
];

// A phone photo, base64: generous, but not unbounded.
const MAX_PHOTO_BASE64 = 8 * 1024 * 1024;

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const prompt = (hasFruits: boolean) =>
  'You are an expert tropical botanist specializing in Philippine flora. ' +
  (hasFruits
    ? 'Analyze these three photos (first is supposed to be leaves, second is supposed to be bark, third is supposed to be fruits or flowers). '
    : 'Analyze these two photos (first is supposed to be leaves, second is supposed to be bark). ') +
  'Perform the following checks IN ORDER:\n\n' +
  'CHECK 1: Do these photos actually contain recognizable plant material ' +
  '(leaves, bark, branches, foliage, fruits, flowers)? If the photos show non-plant subjects ' +
  '(buildings, people, ground, sky, random objects), respond with: ' +
  '{"status": "no_tree"}\n\n' +
  'CHECK 2: Is the subject a TREE? A tree is a woody perennial plant with a single ' +
  'main stem/trunk, typically growing over 3 meters tall at maturity. ' +
  'If the photos show a non-tree plant such as a shrub, herb, grass, vine, fern, ' +
  'moss, weed, or other low-growing vegetation, respond with: ' +
  '{"status": "plant_not_tree", "detectedPlant": "<what you see, e.g. Shrub, Grass, Fern>"}\n\n' +
  'CHECK 3: If it IS a tree, identify the species. ' +
  'You are NOT limited to a specific list. Identify ANY tree species present in the Philippines. ' +
  'Respond with: ' +
  '{"status": "tree", "name": "<common local name>", ' +
  '"scientificName": "<scientific name>", ' +
  '"type": "<Endemic|Introduced|Invasive>", ' +
  '"category": "<Timber|Fruit|Ornamental>"}\n\n' +
  'Reply ONLY with a valid JSON object using one of the three formats above. ' +
  'Do not include markdown tags like ```json.';

async function ask(model: string, timeoutMs: number, key: string, photos: string[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              ...photos.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })),
              { text: prompt(photos.length > 2) },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!response.ok) throw new Error(`${model} answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const body = await response.json();
    const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    // As the app expects it: every value a string, nulls left out.
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)])
    );
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });

  // Who is asking — read as THEM, so the database decides which LGU's they are.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const [role, lgu, active] = await Promise.all([
    asCaller.rpc('my_role'),
    asCaller.rpc('my_lgu'),
    asCaller.rpc('is_active_account'),
  ]);
  if (role.error || active.data !== true || !['field_officer', 'lgu_admin', 'pgenro'].includes(String(role.data))) {
    return reply(403, { error: 'Only an active field officer or office account can identify trees.' });
  }
  const office = role.data === 'pgenro' ? 'pgenro' : lgu.data ? String(lgu.data) : null;
  if (!office) return reply(403, { error: 'This account is not filed under an LGU.' });

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const [own, enabled] = await Promise.all([
    service.rpc('office_ai_key', { p_office: office }),
    service.rpc('office_ai_enabled', { p_office: office }),
  ]);
  if (!enabled.error && enabled.data === false) {
    return reply(403, { status: 'ai_off', error: 'AI identification is switched off in your MENRO / CENRO’s Settings.' });
  }
  const ownKey = !own.error && own.data ? String(own.data) : null;
  const key = ownKey ?? Deno.env.get('GEMINI_API_KEY');
  if (!key) return reply(500, { error: 'No Gemini key: the MENRO / CENRO can add one in Settings.' });

  let body: { leaves?: string; bark?: string; fruits?: string };
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'The request was not JSON.' });
  }
  const clean = (value?: string) => String(value ?? '').replace(/^data:[^,]*,/, '');
  const photos = [clean(body.leaves), clean(body.bark), clean(body.fruits)].filter(Boolean);
  if (!clean(body.leaves) || !clean(body.bark)) return reply(400, { error: 'The leaves and the bark photos are both needed.' });
  if (photos.some((photo) => photo.length > MAX_PHOTO_BASE64)) return reply(413, { error: 'A photo is too large.' });

  const failures: string[] = [];
  for (const [model, timeoutMs] of MODELS) {
    try {
      const result = await ask(model, timeoutMs, key, photos);
      return reply(200, { ...result, model, key: ownKey ? 'office' : 'shared' });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return reply(502, { error: `The AI could not answer: ${failures.join(' | ')}` });
});
