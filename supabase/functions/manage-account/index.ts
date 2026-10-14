// Green Tag: the two account changes that need Supabase's service key.
//
// PGENRO can lock, archive, reactivate and send a password-reset email from
// the website directly — those go through supabase/accounts.sql. Two things
// cannot: setting ANOTHER person's email, and setting another person's
// password. Both are auth.admin calls, which need the service role key, and
// that key must never reach a browser. So they come here.
//
// Locking also signs the officer out everywhere: the database already stops a
// locked account from writing, and the ban here ends the sessions too.
//
// DEPLOY: Supabase dashboard → Edge Functions → Deploy a new function → name it
// `manage-account` → paste this file. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided to every function automatically.
//
// Request (POST, with the caller's own session in the Authorization header):
//   { "action": "set_email",    "user_id": "...", "email": "new@lgu.gov.ph" }
//   { "action": "set_password", "user_id": "...", "password": "..." }
//   { "action": "sign_out",     "user_id": "..." }   // after locking
//   { "action": "allow_sign_in","user_id": "..." }   // after reactivating

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Long enough to mean "until somebody lifts it"; Supabase wants a duration.
const BAN_DURATION = '876000h';

const MIN_PASSWORD_LENGTH = 10;

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Who is asking — read as THEM, through their own token, so the answer is
  // exactly what the database's own rules say about them.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const { data: isPgenro, error: roleError } = await asCaller.rpc('is_pgenro');
  if (roleError || isPgenro !== true) {
    return reply(403, { error: 'Only an active PGENRO account can do this.' });
  }
  const { data: caller } = await asCaller.auth.getUser();

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'The request was not JSON.' });
  }
  const { action, user_id: userId } = body;
  if (!userId) return reply(400, { error: 'Which account? user_id is missing.' });
  if (userId === caller?.user?.id) {
    return reply(400, { error: 'Change your own email or password from your own profile.' });
  }

  const admin = createClient(url, serviceKey);
  let result;
  let logged: Record<string, unknown> = {};

  switch (action) {
    case 'set_email': {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return reply(400, { error: 'That is not an email address.' });
      }
      // email_confirm: PGENRO is vouching for the address; the officer should
      // not be locked out waiting on a confirmation they may never see.
      result = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (!result.error) await admin.from('profiles').update({ email }).eq('id', userId);
      logged = { email };
      break;
    }
    case 'set_password': {
      const password = String(body.password ?? '');
      if (password.length < MIN_PASSWORD_LENGTH) {
        return reply(400, { error: `A password needs at least ${MIN_PASSWORD_LENGTH} characters.` });
      }
      result = await admin.auth.admin.updateUserById(userId, { password });
      // Never the password itself.
      break;
    }
    case 'sign_out':
      result = await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
      break;
    case 'allow_sign_in':
      result = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      break;
    default:
      return reply(400, { error: `Unknown action: ${action}` });
  }

  if (result.error) return reply(400, { error: result.error.message });

  // The service role writes past RLS, which is the only way anything writes
  // to the log directly.
  const { data: target } = await admin
    .from('profiles').select('lgu_psgc').eq('id', userId).maybeSingle();
  const { data: actor } = await admin
    .from('profiles').select('email, role').eq('id', caller?.user?.id ?? '').maybeSingle();
  await admin.from('activity_log').insert({
    actor: caller?.user?.id ?? null,
    actor_email: actor?.email ?? null,
    actor_role: actor?.role ?? null,
    lgu_psgc: target?.lgu_psgc ?? null,
    action: `account.${action}`,
    entity: 'profile',
    entity_id: userId,
    details: logged,
  });

  return reply(200, { ok: true });
});
