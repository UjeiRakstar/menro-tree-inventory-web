// Green Tag: an office's reply to a message from the public, sent by email by
// the system itself — without leaving Green Tag (decided 19 October).
//
// For a guest's message: someone who wrote through the Contact form without a
// Green Tag account. (A resident signed in with Google is replied to in Green
// Tag instead; see supabase/replies.sql.) The email goes out from the
// system's sender address, in the office's name, with the office's own email
// as the address replies go to; the reply is then kept with the message.
//
// The email service is Brevo (brevo.com): free for 300 emails a day, from
// one verified sender address, no domain needed, and called over HTTPS —
// Supabase's servers may not open SMTP ports.
//
//   SET UP, once:
//   1. Make a Brevo account. Senders, Domains & Dedicated IPs → Senders → add
//      the address emails come from (e.g. greentag.laguna@gmail.com) and click
//      the link Brevo emails to it.
//   2. SMTP & API → API Keys → Generate a new API key.
//   3. Supabase dashboard → Edge Functions → Secrets: add
//        BREVO_API_KEY  the key
//        MAIL_FROM      the verified sender address
//   4. Edge Functions → Deploy a new function → Via editor → name it exactly
//      `send-reply` (the name is its address; renaming later does not change
//      it) → paste this file → Deploy.
//   Until then the Inbox opens the office's own email app, as before.
//
// Request (POST, with the office's session): { "message_id": uuid, "body": text }
// Reply: { "ok": true } — or { "error": "not-configured" | "not-allowed" | "send-failed", "message" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const MAX_CHARACTERS = 4000;

/** The email's text: the reply, who it is from, and the message it answers. */
function emailText(body: string, target: Record<string, string>) {
  const sent = new Date(target.sent_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
  const quoted = String(target.original_body ?? '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `${body}\n\n— ${target.office_label}, through Green Tag (Laguna's tree inventory)\n\nYou wrote on ${sent}:\n${quoted}\n`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'not-allowed', message: 'POST only.' });

  const apiKey = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('MAIL_FROM');
  if (!apiKey || !from) {
    return reply(501, { error: 'not-configured', message: 'Sending email from Green Tag is not set up yet.' });
  }

  let input: { message_id?: string; body?: string };
  try {
    input = await request.json();
  } catch {
    return reply(400, { error: 'bad-request', message: 'Send { message_id, body }.' });
  }
  const body = String(input.body ?? '').trim();
  if (!input.message_id || !body || body.length > MAX_CHARACTERS) {
    return reply(400, { error: 'bad-request', message: `Write a reply of up to ${MAX_CHARACTERS.toLocaleString('en-US')} characters.` });
  }

  // Everything below is asked as the office itself: the database says whether
  // the message is in its inbox (reply_target() and record_reply()).
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const { data, error } = await asCaller.rpc('reply_target', { p_message: input.message_id });
  const target = Array.isArray(data) ? data[0] : data;
  if (error || !target?.to_email) {
    return reply(403, { error: 'not-allowed', message: error?.message ?? 'That message is not in your inbox.' });
  }

  const sent = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: `${target.office_label} via Green Tag` },
      to: [{ email: target.to_email, name: target.to_name || undefined }],
      ...(target.reply_to ? { replyTo: { email: target.reply_to, name: target.office_label } } : {}),
      subject: target.subject,
      textContent: emailText(body, target),
    }),
  });
  if (!sent.ok) {
    const detail = await sent.text();
    return reply(502, { error: 'send-failed', message: `The email could not be sent: ${detail.slice(0, 300)}` });
  }

  const { error: recordError } = await asCaller.rpc('record_reply', { p_message: input.message_id, p_body: body, p_channel: 'email' });
  return reply(200, { ok: true, recorded: !recordError });
});
