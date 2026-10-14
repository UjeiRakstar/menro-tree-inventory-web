import { useState } from 'react';
import { LockKeyhole, Smartphone, UserX } from 'lucide-react';
import { supabase } from '../supabaseClient.js';

const ICONS = {
  locked: LockKeyhole,
  archived: UserX,
  mobile_only: Smartphone,
  pending: Smartphone,
  no_profile: UserX,
};

/**
 * What someone signed in sees when the website is not theirs to use.
 *
 * An empty dashboard would leave them wondering whether it is broken. This
 * says what happened, whether it is permanent, and who can change it — and
 * lets them sign out, since a session they cannot use is no use to keep.
 */
export default function AccountBlocked({ access, email }) {
  const [signingOut, setSigningOut] = useState(false);
  const Icon = ICONS[access.kind] ?? UserX;

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    // onAuthStateChange takes it from here: no session, back to the login.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl" role="alert">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Icon size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">{access.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{access.message}</p>
        {email && <p className="mt-4 text-xs text-slate-400">Signed in as {email}</p>}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="mt-6 w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
