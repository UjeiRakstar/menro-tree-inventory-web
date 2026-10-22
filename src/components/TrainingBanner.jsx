import { GraduationCap } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Says, on every office page, that this account is a training account.
 *
 * A trainee uses the real website on the real database; the only difference
 * is the wall in the database (supabase/training_sandbox.sql) that keeps their
 * rows and the real ones apart. Nothing on screen would otherwise tell them
 * apart from the real thing — which is the point of practising on it, and
 * exactly why this cannot be dismissed: a trainee who forgets they are in
 * training, or a real officer who signed in with the training account by
 * mistake, needs to see it on every page.
 */
export default function TrainingBanner() {
  const { profile } = useAuth();
  if (!profile?.is_training) return null;

  return (
    <div
      role="note"
      aria-label="Training mode"
      className="flex shrink-0 items-center gap-3 border-b border-violet-300 bg-violet-600 px-4 py-1.5 text-xs text-white sm:px-6"
    >
      <GraduationCap size={16} className="shrink-0" aria-hidden="true" />
      <p className="flex-1 leading-snug">
        <strong className="font-bold uppercase tracking-wider">Training mode</strong>
        <span className="hidden sm:inline">
          {' '}
          · Everything here is practice data. Nothing you do reaches the real inventory, the public map
          or other offices, and it is all cleared when training ends.
          {profile.role === 'pgenro' &&
            ' You see every town’s practice data; PGENRO’s live work — accounts and codes, the species write-ups, news, map layers, the satellite — stays with the real PGENRO account.'}
        </span>
      </p>
    </div>
  );
}
