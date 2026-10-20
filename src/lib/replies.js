import { supabase } from '../supabaseClient.js';

/**
 * Replies to messages from the public (supabase/replies.sql, decided 19
 * October): in Green Tag to a resident who wrote signed in with Google; by
 * email, sent by the system (the send-reply function), to a guest.
 */

export const MAX_REPLY_CHARACTERS = 4000;

/** How a message is answered: 'in-app' to a resident's account, else 'email'. */
export const replyChannelOf = (message) => (message?.sender_id ? 'in-app' : 'email');

/** The replies already sent to one message, oldest first. */
export async function loadReplies(messageId) {
  const { data, error } = await supabase.from('message_replies').select('*').eq('message_id', messageId).order('created_at', { ascending: true });
  return { replies: Array.isArray(data) ? data : [], error };
}

/**
 * Sends a reply: { ok } when it went, { notSetUp } when email sending is not
 * set up yet (the office's own email app is the way then), or { problem }.
 */
export async function sendReply(message, body) {
  const text = String(body ?? '').trim();
  if (!text) return { problem: 'Write the reply first.' };
  if (text.length > MAX_REPLY_CHARACTERS) return { problem: `A reply is up to ${MAX_REPLY_CHARACTERS.toLocaleString('en-US')} characters.` };

  if (replyChannelOf(message) === 'in-app') {
    const { error } = await supabase.rpc('record_reply', { p_message: message.id, p_body: text, p_channel: 'in-app' });
    return error ? { problem: error.message } : { ok: true };
  }

  const { data, error } = await supabase.functions.invoke('send-reply', { body: { message_id: message.id, body: text } });
  if (!error) return data?.ok ? { ok: true } : { problem: data?.message ?? 'The email could not be sent.' };
  // Not deployed (404), or deployed without its email settings (501).
  const status = error.context?.status;
  let answer = null;
  try {
    answer = await error.context?.json?.();
  } catch {
    answer = null;
  }
  if (status === 404 || status === 501 || answer?.error === 'not-configured') return { notSetUp: true };
  return { problem: answer?.message ?? error.message ?? 'The email could not be sent.' };
}

/** A resident's replies from the offices, newest first. */
export async function loadMyReplies() {
  const { data, error } = await supabase.from('message_replies').select('*').order('created_at', { ascending: false });
  return { replies: Array.isArray(data) ? data : [], error };
}

/** How many replies wait unread for the signed-in resident; 0 when none, or when it cannot be told. */
export async function countUnreadReplies() {
  const { data, error } = await supabase.from('message_replies').select('id').is('read_at', null);
  return error || !Array.isArray(data) ? 0 : data.length;
}

/** Said on the window once a resident's replies are marked read, so the navbar's "!" clears at once. */
export const REPLIES_READ_EVENT = 'greentag:replies-read';
