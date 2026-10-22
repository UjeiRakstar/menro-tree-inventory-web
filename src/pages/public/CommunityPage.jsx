import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronDown, Leaf, Loader2, LogOut, MapPin, Megaphone, ShieldCheck, Sprout, Trash2, TreePine, Users } from 'lucide-react';
// The community at work: a resident planting a seedling. Shrunk from
// src/assets/community-hero.jpg by tools/optimise-images.mjs; a new photo
// replaces that file (with the agreement of the people in it, RA 10173) and
// the tool is run again.
import heroImg from '../../assets/optimised/community-hero.avif';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Leaderboard from '../../components/public/Leaderboard.jsx';
import OfficeReplies from '../../components/public/OfficeReplies.jsx';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import {
  WHAT_IS_KEPT,
  WHAT_IS_NOT_KEPT,
  WHY_IT_IS_KEPT,
  displayNameOf,
  isMissingFunction,
  isProviderOff,
  nicknameShapeProblem,
  rememberToTag,
  signInWithGoogle,
  takeTagWish,
} from '../../lib/community.js';

/** What a resident can do for Laguna's trees, beside tagging them. */
const WAYS = [
  { icon: TreePine, title: 'Tag the trees around you', text: 'A photo and a tap on the map add a tree to Laguna’s inventory once a field officer checks it — citizen science the City Biodiversity Index counts.' },
  { icon: Sprout, title: 'Join the tree plantings', text: 'Your city or municipality and PGENRO plant on the sites they set aside. The events are on the home page, with their place on the map.' },
  { icon: Leaf, title: 'Look after what grows', text: 'Native and endemic trees hold the soil, cool the streets and shelter wildlife. Learn them in the Tree Database; plant them, and keep them.' },
  { icon: Megaphone, title: 'Spread the word', text: 'Talks, seminars and clean-ups — the offices’ information and education campaigns — reach further when residents bring their neighbours.' },
  { icon: CalendarDays, title: 'Report what needs care', text: 'A leaning or diseased tree, or one by the power lines: write to your MENRO / CENRO from Contact Us.' },
];

/** The top of the page, as About's: the photo, the call, the sign-up. */
function Hero({ signUp, joined, signedIn, starting }) {
  return (
    <section className="relative overflow-hidden bg-green-900" aria-label="Green Tag Community">
      <img src={heroImg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[50%_60%] opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-green-950/80" />
      <div className="relative mx-auto flex min-h-[26rem] max-w-6xl flex-col justify-end px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <p className="text-sm font-bold uppercase tracking-widest text-lime-200">Get involved</p>
        <h1 className="mt-2 flex items-center gap-3 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          <Users size={44} className="shrink-0 text-lime-300" aria-hidden="true" />
          <span className="min-w-0">Green Tag Community</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-green-50 sm:text-lg">
          Laguna&apos;s trees are counted, planted and cared for by the people who live among them. Join, tag the trees you
          know, and take part in the plantings near you.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {joined ? (
            <Link to="/public-map?tag=1" className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-6 py-3 text-base font-bold text-green-950 shadow-lg hover:bg-lime-300">
              <MapPin size={18} aria-hidden="true" /> Tag a tree
            </Link>
          ) : (
            <button type="button" onClick={signUp} disabled={starting}
              className="inline-flex items-center gap-3 rounded-xl bg-white px-6 py-3 text-base font-bold text-slate-900 shadow-lg hover:bg-green-50 disabled:opacity-60">
              {starting ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
              {signedIn ? 'Finish joining below' : 'Sign up with Google'}
            </button>
          )}
          <a href="#why" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold text-white ring-1 ring-white/60 hover:bg-white/10">
            Why it matters <ChevronDown size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

/** Why community involvement matters, and the ways to be part of it. */
function WhyItMatters() {
  return (
    <section id="why" aria-label="Why the community matters" className="scroll-mt-20 bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-extrabold text-green-900 sm:text-3xl">Why the community matters</h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-700">
          No office can walk every street and every slope. The trees residents tag fill the inventory faster than any
          survey; the plantings they join take root because neighbours keep them; and a province whose people know their
          native trees protects them. The City Biodiversity Index counts this too — community science, outreach and
          partnerships are among its indicators.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WAYS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl bg-green-50/60 p-5 ring-1 ring-green-100">
              <Icon size={24} className="text-green-700" aria-hidden="true" />
              <h3 className="mt-2 text-base font-bold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Google's "G", in its own colours, as Google asks its sign-in buttons to carry. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function WhatIsKept() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <ShieldCheck size={18} className="text-green-700" aria-hidden="true" /> What Green Tag keeps of you
      </h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
        {WHAT_IS_KEPT.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p className="mt-3 text-sm text-slate-700">{WHAT_IS_NOT_KEPT}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{WHY_IT_IS_KEPT}</p>
    </div>
  );
}

/** How the resident is shown, and their agreement. The first time, and to change it. */
function JoinForm({ resident, joined, onDone }) {
  const { refreshProfile } = useAuth();
  const [showAs, setShowAs] = useState(resident.show_as ?? 'name');
  const [nickname, setNickname] = useState(resident.nickname ?? '');
  const [agree, setAgree] = useState(joined);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  async function save(event) {
    event.preventDefault();
    setProblem('');
    if (showAs === 'nickname') {
      const shape = nicknameShapeProblem(nickname);
      if (shape) {
        setProblem(shape);
        return;
      }
    }
    if (!agree) {
      setProblem('Agree to what is kept before you join.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('set_resident_profile', {
      p_show_as: showAs,
      p_nickname: showAs === 'nickname' ? nickname.trim() : resident.nickname ?? null,
      p_agree: true,
    });
    setSaving(false);
    if (error) {
      setProblem(isMissingFunction(error) ? 'Joining opens soon: the database is still being set up.' : error.message);
      return;
    }
    await refreshProfile();
    onDone?.();
  }

  const radio = 'flex items-start gap-2 rounded-xl p-3 ring-1 cursor-pointer';
  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-label="How you are shown">
      <fieldset>
        <legend className="text-sm font-bold text-slate-900">On the leaderboard, show me as</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className={`${radio} ${showAs === 'name' ? 'bg-green-50 ring-green-400' : 'ring-slate-200'}`}>
            <input type="radio" name="show-as" value="name" checked={showAs === 'name'} onChange={() => setShowAs('name')} className="mt-1" />
            <span className="text-sm">
              <span className="block font-semibold text-slate-800">My name</span>
              <span className="text-slate-500">{resident.full_name || 'The name on your Google account'}</span>
            </span>
          </label>
          <label className={`${radio} ${showAs === 'nickname' ? 'bg-green-50 ring-green-400' : 'ring-slate-200'}`}>
            <input type="radio" name="show-as" value="nickname" checked={showAs === 'nickname'} onChange={() => setShowAs('nickname')} className="mt-1" />
            <span className="text-sm">
              <span className="block font-semibold text-slate-800">A nickname</span>
              <span className="text-slate-500">Lewd, abusive or office-sounding names are refused.</span>
            </span>
          </label>
        </div>
      </fieldset>
      {showAs === 'nickname' && (
        <label className="block text-sm font-semibold text-slate-700">
          Nickname
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24}
            placeholder="e.g. Puno ng Laguna"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600" />
          <span className="mt-1 block text-xs font-normal text-slate-500">3 to 24 letters, numbers, spaces, dots, dashes or underscores.</span>
        </label>
      )}
      {!joined && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} className="mt-1" />
          <span>
            I agree to Green Tag keeping what is listed above, and only that, for the leaderboard and the City Biodiversity
            Index, and to the <a href="/terms.html" target="_blank" rel="noreferrer" className="font-semibold text-green-800 underline">Terms of Use</a> and <a href="/privacy.html" target="_blank" rel="noreferrer" className="font-semibold text-green-800 underline">Privacy Policy</a>.
          </span>
        </label>
      )}
      {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
      <button type="submit" disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50">
        {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
        {joined ? 'Save' : 'Join'}
      </button>
    </form>
  );
}

function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy}
      onClick={async () => {
        setBusy(true);
        await supabase.auth.signOut();
        setBusy(false);
      }}
      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50">
      <LogOut size={15} aria-hidden="true" /> Sign out
    </button>
  );
}

/**
 * A resident's right to erasure (RA 10173): the account and everything kept
 * of it, gone at once (delete_my_account() in community.sql). The trees they
 * tagged stay, as trees, credited to nobody.
 */
function DeleteAccount({ onDeleted }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function remove() {
    setBusy(true);
    setProblem('');
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setBusy(false);
      setProblem(isMissingFunction(error) ? 'Deleting an account opens soon: the database is still being set up.' : error.message);
      return;
    }
    onDeleted?.();
    await supabase.auth.signOut();
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)}
        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50">
        <Trash2 size={15} aria-hidden="true" /> Delete my account
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-what" className="space-y-3 rounded-2xl bg-red-50 p-5 ring-1 ring-red-200">
      <h2 id="delete-title" className="text-base font-bold text-red-900">Delete your account?</h2>
      <p id="delete-what" className="text-sm text-red-900">
        Your sign-in, email, name or nickname and your agreement are deleted, and you leave the leaderboard. The trees you
        tagged stay on the map as trees, credited to nobody. This cannot be undone; you can always join again.
      </p>
      {problem && <p role="alert" className="rounded-lg bg-white px-3 py-2 text-sm text-red-700">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={remove} disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          Yes, delete my account
        </button>
        <button type="button" onClick={() => setAsking(false)} disabled={busy}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-white">
          Keep it
        </button>
      </div>
    </div>
  );
}

/**
 * The community: residents who sign in with Google so the trees they tag are
 * counted for them — on the leaderboard, and in the count of residents taking
 * part that the City Biodiversity Index asks for. Only Google; only a name or
 * nickname and the tags (supabase/community.sql).
 */
export default function CommunityPage() {
  const { session, profile, resident, loading } = useAuth();
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [boardLgu, setBoardLgu] = useState('');
  const navigate = useNavigate();

  // Signed up from the call to action: once joined, straight to the map with
  // Tag a tree open (22 October).
  const joined = Boolean(resident?.consented_at);
  useEffect(() => {
    if (joined && takeTagWish()) navigate('/public-map?tag=1', { replace: true });
  }, [joined, navigate]);

  async function join() {
    setStarting(true);
    setProblem('');
    rememberToTag();
    const { error } = await signInWithGoogle();
    // On success the browser is on its way to Google.
    if (error) {
      setStarting(false);
      setProblem(isProviderOff(error)
        ? 'Signing in with Google is not switched on yet. Please try again soon.'
        : `Google sign-in could not start: ${error.message}`);
    }
  }

  let panel;
  if (loading) {
    panel = (
      <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking whether you are signed in…
      </p>
    );
  } else if (!session) {
    panel = (
      <div className="space-y-4">
        <WhatIsKept />
        <button type="button" onClick={join} disabled={starting}
          className="inline-flex items-center gap-3 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60">
          {starting ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
          Continue with Google
        </button>
        <p className="text-xs text-slate-500">
          Only Google accounts can join. You can still tag trees without joining; they are just not counted for you.
        </p>
        {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
      </div>
    );
  } else if (profile) {
    panel = (
      <div role="note" className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">
          You are signed in with an office account. The community is for residents who sign in with Google.
        </p>
        <Link to="/biodiversity-dashboard" className="inline-block text-sm font-semibold text-green-800 underline">Back to your dashboard</Link>
      </div>
    );
  } else if (!resident) {
    panel = (
      <div role="note" className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">
          You are signed in, but joining is not open yet: the database is still being set up. Please come back soon.
        </p>
        <SignOutButton />
      </div>
    );
  } else if (!resident.consented_at) {
    panel = (
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Signed in as <span className="font-semibold">{resident.full_name || session.user?.email}</span>. One step left.
        </p>
        <WhatIsKept />
        <JoinForm resident={resident} joined={false} />
        <div className="flex flex-wrap gap-2">
          <SignOutButton />
          <DeleteAccount onDeleted={() => setDeleted(true)} />
        </div>
      </div>
    );
  } else {
    panel = (
      <div className="space-y-4">
        <div className="rounded-2xl bg-green-800 p-5 text-white shadow">
          <p className="text-sm text-green-100">You have joined as</p>
          <p className="text-2xl font-extrabold">{displayNameOf(resident)}</p>
          <p className="mt-2 text-sm text-green-100">
            Every tree you tag while signed in is counted for you once a field officer verifies it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/public-map?tag=1" className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-green-800 hover:bg-green-50">
              <MapPin size={15} aria-hidden="true" /> Tag a tree
            </Link>
            <button type="button" onClick={() => setEditing((open) => !open)} aria-expanded={editing}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/60 hover:bg-white/10">
              Change how I am shown
            </button>
          </div>
        </div>
        {editing && <JoinForm resident={resident} joined onDone={() => setEditing(false)} />}
        <OfficeReplies />
        <div className="flex flex-wrap gap-2">
          <SignOutButton />
          <DeleteAccount onDeleted={() => setDeleted(true)} />
        </div>
      </div>
    );
  }

  return (
    <>
    <Hero signUp={join} joined={joined} signedIn={Boolean(session) && !profile} starting={starting} />
    <WhyItMatters />
    <div className="bg-gray-50 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Join, and see the board</h2>
        <p className="mt-3 max-w-3xl text-base text-gray-700">
          Sign in with Google and the trees you tag are counted for you. The residents whose tags are verified in the field
          most often lead the board.
        </p>
        {deleted && !session && (
          <p role="status" className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900 ring-1 ring-green-200">
            Your account, and everything kept with it, is deleted.
          </p>
        )}
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_24rem]">
          <div>{panel}</div>
          <div className="self-start rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <label className="mb-3 block text-xs font-semibold text-slate-600">
              Leaderboard for
              <select value={boardLgu} onChange={(event) => setBoardLgu(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800">
                <option value="">All of Laguna</option>
                {MUNICIPALITY_LIST.map((item) => <option key={item.psgc} value={item.psgc}>{item.label}</option>)}
              </select>
            </label>
            <Leaderboard limit={10} lgu={boardLgu ? Number(boardLgu) : null} />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
