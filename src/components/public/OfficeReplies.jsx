import { useEffect, useState } from 'react';
import { Loader2, MessageSquareReply } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { loadMyReplies } from '../../lib/replies.js';

const when = (value) => new Date(value).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * What the offices replied to a resident's messages (supabase/replies.sql):
 * newest first, each with what they wrote. Shown, they are marked read.
 */
export default function OfficeReplies() {
  const [state, setState] = useState({ loading: true, replies: [] });

  useEffect(() => {
    let cancelled = false;
    loadMyReplies().then(({ replies }) => {
      if (cancelled) return;
      setState({ loading: false, replies });
      if (replies.some((reply) => !reply.read_at)) supabase.rpc('mark_my_replies_read');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading your replies…
      </p>
    );
  }
  return (
    <section aria-label="Replies from the offices" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <MessageSquareReply size={18} className="text-green-700" aria-hidden="true" /> Replies from the offices
      </h2>
      {state.replies.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          None yet. Write to an office from Contact Us while you are signed in, and its reply comes here.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {state.replies.map((reply) => (
            <li key={reply.id} className={`rounded-xl p-3 ring-1 ${reply.read_at ? 'ring-slate-200' : 'bg-green-50 ring-green-300'}`}>
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{reply.office_label}</span> · {when(reply.created_at)}
                {!reply.read_at && <span className="ml-2 rounded-full bg-green-700 px-2 py-0.5 text-[10px] font-bold text-white">New</span>}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{reply.body}</p>
              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer">What you wrote</summary>
                <p className="mt-1 whitespace-pre-wrap">{reply.original_body}</p>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
