import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { Users, UserPlus, Trash2, UserCheck, Check, X, MapPin } from 'lucide-react';
import { LGU_OPTIONS, barangaysOf, labelOf } from '../lib/lguOptions.js';
import { useAuthIfAny } from '../context/AuthContext.jsx';
import { ROLES, roleOf } from '../lib/roles.js';
import { useActingLgu } from '../lib/actingLgu.js';
import ActingLguPicker from '../components/ActingLguPicker.jsx';
import { everyRow } from '../lib/everyRow.js';

export default function ManageArborists() {
  // A MENRO / CENRO makes field officers for its own LGU only: an officer
  // placed elsewhere would land out of its sight (found 15 October).
  const auth = useAuthIfAny();
  // The super admin working in one LGU (actingLgu.js) sees its field team as
  // its office does, and adds officers to it.
  const { lgu: actingLgu } = useActingLgu(auth?.profile);
  const actingIn = actingLgu ? LGU_OPTIONS.find((lgu) => lgu.psgc === actingLgu.psgc) ?? null : null;
  const ownLgu = actingIn ??
    (roleOf(auth?.profile) === ROLES.LGU_ADMIN
      ? LGU_OPTIONS.find((lgu) => lgu.psgc === Number(auth.profile.lgu_psgc)) ?? null
      : null);
  const [arborists, setArborists] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loadingArborists, setLoadingArborists] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [taskCounts, setTaskCounts] = useState({}); // { email: { assigned: N, cancelled: N } }

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [municipality, setMunicipality] = useState(ownLgu?.name ?? '');
  const [barangay, setBarangay] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // Arborists who signed up on the mobile app and are waiting on MENRO.
  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [actioningId, setActioningId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [declineReason, setDeclineReason] = useState('');

  // Working in one LGU: its people only, and new officers placed in it.
  const inScope = (row) => !actingIn || Number(row?.lgu_psgc) === actingIn.psgc || row?.municipality === actingIn.name;
  const shownPending = pending.filter(inScope);
  const shownProfiles = profiles.filter(inScope);
  const scopeEmails = new Set(shownProfiles.map((p) => String(p.email ?? '').toLowerCase()));
  const shownArborists = arborists.filter(
    (row) => !actingIn || row?.municipality === actingIn.name || scopeEmails.has(String(row?.email ?? '').toLowerCase())
  );
  useEffect(() => {
    if (actingIn) {
      setMunicipality(actingIn.name);
      setBarangay('');
    }
  }, [actingIn]);

  const PH_MOBILE_DIGITS = 11;

  /** Strip non-digits and clamp to 11 characters. */
  function handleContactChange(e) {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, PH_MOBILE_DIGITS);
    setContactNumber(digitsOnly);
    setFormErrors((prev) => ({ ...prev, contactNumber: undefined }));
  }

  /** Validate all form fields. Returns error map (empty = valid). */
  function validateForm() {
    const errs = {};
    if (!name.trim()) errs.name = 'Full name is required.';
    if (!email.trim()) {
      errs.email = 'Email address is required.';
    } else if (!email.includes('@') || !email.includes('.')) {
      errs.email = 'Enter a valid email address (must contain @ and a domain).';
    }
    if (!municipality) errs.municipality = 'Municipality is required for geofencing.';
    if (!barangay) errs.barangay = 'Barangay is required.';
    if (contactNumber && contactNumber.length !== PH_MOBILE_DIGITS) {
      errs.contactNumber = `Contact number must be exactly ${PH_MOBILE_DIGITS} digits (e.g. 09171234567).`;
    }
    if (!temporaryPassword) {
      errs.temporaryPassword = 'Temporary password is required.';
    } else if (temporaryPassword.length < 6) {
      errs.temporaryPassword = 'Password must be at least 6 characters.';
    }
    return errs;
  }

  // Fetch arborists from public.arborists
  useEffect(() => {
    let cancelled = false;
    async function fetchArborists() {
      try {
        const { data, error } = await supabase.from('arborists').select('*');
        if (cancelled) return;
        if (error) {
          setErrorMessage(error.message ?? 'Failed to load arborists.');
          setLoadingArborists(false);
          return;
        }
        setArborists(Array.isArray(data) ? data : []);
        setLoadingArborists(false);
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e?.message ?? 'Unexpected error loading arborists.');
        setLoadingArborists(false);
      }
    }
    fetchArborists();
    return () => { cancelled = true; };
  }, []);

  // Fetch task counts from trees table
  useEffect(() => {
    async function fetchTaskCounts() {
      const { data } = await everyRow(() => supabase.from('trees').select('id, assigned_to, task_status'));
      if (!Array.isArray(data)) return;
      const counts = {};
      data.forEach(t => {
        if (!t.assigned_to) return;
        if (!counts[t.assigned_to]) counts[t.assigned_to] = { assigned: 0, cancelled: 0 };
        counts[t.assigned_to].assigned += 1;
        if (t.task_status === 'Cancelled') counts[t.assigned_to].cancelled += 1;
      });
      setTaskCounts(counts);
    }
    fetchTaskCounts();
  }, []);

  // Fetch profiles from public.profiles (mirrors auth.users)
  useEffect(() => {
    let cancelled = false;
    async function fetchProfiles() {
      try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (cancelled) return;
        if (error) {
          // profiles table might not exist yet — fail silently
          console.warn('Could not load profiles:', error.message);
          setLoadingProfiles(false);
          return;
        }
        setProfiles(Array.isArray(data) ? data : []);
        setLoadingProfiles(false);
      } catch (e) {
        if (cancelled) return;
        setLoadingProfiles(false);
      }
    }
    fetchProfiles();
    return () => { cancelled = true; };
  }, []);

  // Fetch mobile sign-ups awaiting approval. Pending means not yet approved
  // and not previously declined.
  useEffect(() => {
    let cancelled = false;
    async function fetchPending() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('is_approved', false)
          .is('rejected_at', null);
        if (cancelled) return;
        if (error) {
          console.warn('Could not load pending applications:', error.message);
          setLoadingPending(false);
          return;
        }
        setPending(Array.isArray(data) ? data : []);
      } catch (e) {
        if (cancelled) return;
      }
      setLoadingPending(false);
    }
    fetchPending();
    return () => { cancelled = true; };
  }, []);

  /**
   * Explains why a write was blocked, instead of leaving it a guessing game.
   *
   * A zero-row update means Postgres did not consider this session allowed to
   * touch that row. The two reasons are "the policy is missing" and "you are
   * signed in as an account that is not an admin", and they need opposite
   * fixes — so ask the database which one it is.
   */
  async function describeBlockedWrite() {
    let email = 'this account';
    try {
      const { data } = await supabase.auth.getUser();
      email = data?.user?.email ?? email;
    } catch {
      // Not worth failing the message over.
    }

    const { data: isAdmin, error } = await supabase.rpc('is_menro_admin');

    if (error) {
      return (
        `Signed in as ${email}. The is_menro_admin() function is missing or ` +
        `not callable (${error.message}), so the policy cannot work yet — ` +
        'run supabase/admin_approval_policy.sql.'
      );
    }
    if (isAdmin === true) {
      return (
        `Signed in as ${email}, which IS an admin — so the policy itself is ` +
        'missing or does not cover UPDATE on public.profiles. Re-run the ' +
        'policy section of supabase/admin_approval_policy.sql.'
      );
    }
    return (
      `Signed in as ${email}, which is NOT an admin. Run this in the Supabase ` +
      `SQL editor:  update public.profiles set role = 'admin' where email = ` +
      `'${email}';`
    );
  }

  /** profiles.contact_number is text; arborists.contact_number is numeric. */
  function toRosterContact(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits ? Number(digits) : null;
  }

  /**
   * Approve an application: flip the gate the mobile app's login checks, and
   * add the arborist to public.arborists, which is what the dispatch assignee
   * list reads. Without the second step an approved arborist could log in but
   * could never be given a task.
   */
  async function handleApprove(profile) {
    setActioningId(profile.id);
    setErrorMessage('');

    // .select() matters: RLS filters rows out of an UPDATE rather than
    // rejecting it, so a write the policy forbids comes back as success with
    // zero rows touched. Without checking the returned rows this reports an
    // approval that never happened.
    const { data: approved, error: approveError } = await supabase
      .from('profiles')
      .update({ is_approved: true, rejected_at: null, rejection_reason: null })
      .eq('id', profile.id)
      .select('id');

    if (approveError) {
      setErrorMessage(`Could not approve ${profile.email}: ${approveError.message}`);
      setActioningId(null);
      return;
    }

    if (!approved || approved.length === 0) {
      const why = await describeBlockedWrite();
      setErrorMessage(
        `${profile.email} was NOT approved: row-level security on ` +
          `public.profiles changed no rows. ${why}`,
      );
      setActioningId(null);
      return;
    }

    const { data: roster, error: rosterError } = await supabase
      .from('arborists')
      .upsert({
        name: profile.full_name,
        email: profile.email,
        contact_number: toRosterContact(profile.contact_number),
        status: 'Active',
      }, { onConflict: 'email' })
      .select();

    if (rosterError) {
      // The account works; they just are not dispatchable yet. Say so rather
      // than reporting a clean success.
      setErrorMessage(
        `${profile.email} was approved, but could not be added to the dispatch roster: ${rosterError.message}`,
      );
    } else if (roster && roster.length > 0) {
      setArborists((prev) =>
        prev.some((a) => a.email === roster[0].email) ? prev : [...prev, roster[0]],
      );
    }

    setPending((prev) => prev.filter((item) => item.id !== profile.id));
    setActioningId(null);
  }

  /** Decline an application, with an optional reason the arborist will see. */
  async function handleDecline(profile) {
    setActioningId(profile.id);
    setErrorMessage('');

    const { data: declined, error } = await supabase
      .from('profiles')
      .update({
        rejected_at: new Date().toISOString(),
        rejection_reason: declineReason.trim() || null,
      })
      .eq('id', profile.id)
      .select('id');

    if (error) {
      setErrorMessage(`Could not decline ${profile.email}: ${error.message}`);
      setActioningId(null);
      return;
    }

    // Same silent-no-op trap as approving.
    if (!declined || declined.length === 0) {
      const why = await describeBlockedWrite();
      setErrorMessage(
        `${profile.email} was NOT declined: row-level security on ` +
          `public.profiles changed no rows. ${why}`,
      );
      setActioningId(null);
      return;
    }

    setPending((prev) => prev.filter((item) => item.id !== profile.id));
    setDecliningId(null);
    setDeclineReason('');
    setActioningId(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const errs = validateForm();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // 1. Create auth account so the arborist can log into the mobile app
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: temporaryPassword,
      options: {
        // The municipality is what places a field officer in an LGU (see
        // lgu_named() in supabase/accounts.sql), and it is only read as the
        // account is created. Written to the profile afterwards, as below, it
        // is too late: the officer would belong to no LGU, and the MENRO who
        // just created them could not see them. The role in here is ignored;
        // the database decides that.
        data: { full_name: name, role: 'arborist', municipality },
      },
    });

    if (authError) {
      console.error('Failed to create auth account:', authError.message);
      setFormErrors({ submit: `Auth error: ${authError.message}` });
      return;
    }

    // 2. Also insert into the arborists table for task assignment
    const payload = {
      name,
      email,
      contact_number: contactNumber ? Number(contactNumber) : null,
      status: 'Active',
    };

    const { data, error } = await supabase.from('arborists').insert(payload).select();

    if (error) {
      console.error('Failed to create arborist record:', error.message);
      setFormErrors({ submit: `Database error: ${error.message}` });
      return;
    }

    if (data && data.length > 0) {
      setArborists((prev) => [...prev, data[0]]);
    }

    // 3. Record the assigned area on the profile. The mobile geofence reads
    // profiles.municipality, so without this the arborist has no area and
    // their captures are never checked against an LGU.
    if (authData?.user?.id) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        email,
        full_name: name,
        contact_number: contactNumber || null,
        municipality,
        barangay,
        is_approved: true, // created by MENRO, so already approved
      });
      if (profileError) {
        setFormErrors({
          submit: `Account created, but the assigned area could not be saved: ${profileError.message}`,
        });
        return;
      }
    }

    setName('');
    setEmail('');
    setContactNumber('');
    setMunicipality(ownLgu?.name ?? '');
    setBarangay('');
    setTemporaryPassword('');
    setFormErrors({});
  }

  async function handleDeleteArborist(arboristId) {
    // Find the arborist's email to cascade unassign their trees
    const arborist = arborists.find(a => a.id === arboristId);
    const arboristEmail = arborist?.email;

    // Cascade: unassign all trees assigned to this arborist
    if (arboristEmail) {
      await supabase
        .from('trees')
        .update({ assigned_to: null, task_status: 'Pending' })
        .eq('assigned_to', arboristEmail);
    }

    // Delete the arborist record
    const { error } = await supabase
      .from('arborists')
      .delete()
      .eq('id', arboristId);

    if (error) {
      console.error('Failed to delete arborist:', error.message);
      return;
    }

    setArborists((prev) => prev.filter((a) => a.id !== arboristId));
  }

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Arborists</h1>
        <p className="mt-2 text-slate-600">
          Manage field team arborists and view registered system users.
        </p>
      </header>

      <ActingLguPicker profile={auth?.profile} what="its field team" />

      {errorMessage && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Pending Applications (mobile sign-ups awaiting MENRO approval) */}
      <section
        aria-label="Pending Applications"
        className={`rounded-lg shadow-sm border overflow-hidden ${
          shownPending.length > 0 ? 'bg-amber-50/40 border-amber-300' : 'bg-white border-slate-200'
        }`}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <UserCheck size={18} className={shownPending.length > 0 ? 'text-amber-700' : 'text-slate-600'} />
          <h2 className="text-base font-semibold text-slate-900">Pending Applications</h2>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
            shownPending.length > 0 ? 'bg-amber-200 text-amber-900 font-semibold' : 'bg-slate-100 text-slate-500'
          }`}>
            {shownPending.length} waiting
          </span>
        </div>

        {loadingPending && (
          <div className="p-6 text-sm text-slate-600">Loading applications…</div>
        )}

        {!loadingPending && shownPending.length === 0 && (
          <div className="p-6 text-sm text-slate-500">
            No applications waiting. Arborists who register on the mobile app appear here for approval.
          </div>
        )}

        {!loadingPending && shownPending.length > 0 && (
          <ul className="divide-y divide-amber-200">
            {shownPending.map((profile) => (
              <li key={profile.id} className="px-6 py-4">
                <div className="flex items-start gap-4">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={`${profile.full_name || profile.email} profile photo`}
                      className="h-11 w-11 rounded-full object-cover border border-amber-300"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-sm font-semibold text-amber-800">
                      {(profile.full_name || profile.email || '?').trim().charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{profile.full_name || '—'}</p>
                    <p className="text-sm text-slate-600 truncate">{profile.email ?? '—'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} className="text-slate-400" />
                        {profile.municipality
                          ? `${profile.barangay ? `Brgy. ${profile.barangay}, ` : ''}${labelOf(profile.municipality)}`
                          : 'No area given'}
                      </span>
                      {profile.contact_number && <span>{profile.contact_number}</span>}
                      {profile.created_at && (
                        <span className="text-slate-400">
                          Applied {new Date(profile.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {!profile.municipality && (
                      <p className="mt-1 text-xs text-amber-800">
                        No municipality on file, so this arborist will have no geofence until one is set.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={actioningId === profile.id}
                      onClick={() => handleApprove(profile)}
                      className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50 transition"
                    >
                      <Check size={12} />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={actioningId === profile.id}
                      onClick={() => {
                        setDecliningId(decliningId === profile.id ? null : profile.id);
                        setDeclineReason('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition"
                    >
                      <X size={12} />
                      Decline
                    </button>
                  </div>
                </div>

                {decliningId === profile.id && (
                  <div className="mt-3 ml-[3.75rem] flex flex-wrap items-center gap-2">
                    <label className="flex-1 min-w-[16rem]">
                      <span className="sr-only">Reason for declining {profile.email}</span>
                      <input
                        type="text"
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Reason (optional) — the arborist sees this in the app"
                        className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={actioningId === profile.id}
                      onClick={() => handleDecline(profile)}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50 transition"
                    >
                      Confirm decline
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDecliningId(null); setDeclineReason(''); }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Create Arborist Form */}
      <section
        aria-label="Account Creation Form"
        className="bg-white rounded-lg shadow-sm border border-slate-200 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={20} className="text-green-700" />
          <h2 className="text-lg font-semibold text-slate-900">Create Arborist Account</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {formErrors.submit && (
            <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formErrors.submit}
            </div>
          )}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Full Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setFormErrors((p) => ({ ...p, name: undefined })); }}
              className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                formErrors.name ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-green-500 focus:ring-green-500/20'
              }`}
            />
            {formErrors.name && <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email Address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFormErrors((p) => ({ ...p, email: undefined })); }}
              placeholder="name@example.com"
              className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                formErrors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-green-500 focus:ring-green-500/20'
              }`}
            />
            {formErrors.email && <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Contact Number <span className="text-slate-400 font-normal">(11-digit PH mobile)</span>
            </span>
            <input
              type="tel"
              inputMode="numeric"
              pattern="\d*"
              maxLength={PH_MOBILE_DIGITS}
              value={contactNumber}
              onChange={handleContactChange}
              placeholder="09171234567"
              className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                formErrors.contactNumber ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-green-500 focus:ring-green-500/20'
              }`}
            />
            <div className="mt-1 flex items-center justify-between">
              {formErrors.contactNumber ? (
                <p className="text-xs text-red-600">{formErrors.contactNumber}</p>
              ) : (
                <span className="text-[10px] text-slate-400">Numbers only.</span>
              )}
              <span className={`text-[10px] ${contactNumber.length === PH_MOBILE_DIGITS ? 'text-green-600' : 'text-slate-400'}`}>
                {contactNumber.length}/{PH_MOBILE_DIGITS}
              </span>
            </div>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Municipality / City <span className="text-slate-400 font-normal">(geofenced area)</span>
            </span>
            {ownLgu ? (
              <input
                readOnly
                value={ownLgu.label}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
              />
            ) : (
            <select
              value={municipality}
              onChange={(e) => {
                setMunicipality(e.target.value);
                setBarangay(''); // the old barangay belongs to the old LGU
                setFormErrors((p) => ({ ...p, municipality: undefined, barangay: undefined }));
              }}
              className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 bg-white ${
                formErrors.municipality ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-green-500 focus:ring-green-500/20'
              }`}
            >
              <option value="">Select a municipality or city…</option>
              {LGU_OPTIONS.map((lgu) => (
                <option key={lgu.psgc} value={lgu.name}>{lgu.label}</option>
              ))}
            </select>
            )}
            {formErrors.municipality
              ? <p className="mt-1 text-xs text-red-600">{formErrors.municipality}</p>
              : <span className="mt-1 block text-[10px] text-slate-400">
                  {ownLgu ? 'Your own LGU: an office makes field officers for itself only.' : 'The arborist cannot record trees outside this LGU.'}
                </span>}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Barangay</span>
            <select
              value={barangay}
              disabled={!municipality}
              onChange={(e) => {
                setBarangay(e.target.value);
                setFormErrors((p) => ({ ...p, barangay: undefined }));
              }}
              className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 bg-white ${
                formErrors.barangay ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-green-500 focus:ring-green-500/20'
              }`}
            >
              <option value="">
                {municipality ? 'Select a barangay…' : 'Choose a municipality first'}
              </option>
              {barangaysOf(municipality).map((brgy) => (
                <option key={brgy} value={brgy}>{brgy}</option>
              ))}
            </select>
            {formErrors.barangay && <p className="mt-1 text-xs text-red-600">{formErrors.barangay}</p>}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Temporary Password</span>
            <input
              type="password"
              value={temporaryPassword}
              onChange={(e) => { setTemporaryPassword(e.target.value); setFormErrors((p) => ({ ...p, temporaryPassword: undefined })); }}
              className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                formErrors.temporaryPassword ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-green-500 focus:ring-green-500/20'
              }`}
            />
            {formErrors.temporaryPassword && <p className="mt-1 text-xs text-red-600">{formErrors.temporaryPassword}</p>}
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition"
            >
              <UserPlus size={16} />
              Create Arborist Account
            </button>
          </div>
        </form>
      </section>

      {/* Arborists Table (public.arborists) */}
      <section
        aria-label="Arborists Table"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <Users size={18} className="text-green-700" />
          <h2 className="text-base font-semibold text-slate-900">Field Team Arborists</h2>
          <span className="ml-auto text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {shownArborists.length} records
          </span>
        </div>

        {loadingArborists && (
          <div className="p-6 text-sm text-slate-600">Loading arborists…</div>
        )}

        {!loadingArborists && shownArborists.length === 0 && (
          <div className="p-6 text-sm text-slate-500">No arborists found.</div>
        )}

        {!loadingArborists && shownArborists.length > 0 && (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Email</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Contact</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Tasks</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Declined</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {shownArborists.map((arborist) => {
                const counts = taskCounts[arborist.email] || { assigned: 0, cancelled: 0 };
                return (
                  <tr key={arborist.id}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{arborist.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{arborist.email ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{arborist.contact_number ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {counts.assigned}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        counts.cancelled > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {counts.cancelled}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={
                        arborist.status === 'Active'
                          ? 'inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700'
                          : 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600'
                      }>
                        {arborist.status ?? 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        type="button"
                        onClick={() => handleDeleteArborist(arborist.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Registered Users Table (public.profiles) */}
      <section
        aria-label="Registered Users Table"
        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <Users size={18} className="text-slate-600" />
          <h2 className="text-base font-semibold text-slate-900">Registered System Users</h2>
          <span className="ml-auto text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {shownProfiles.length} users
          </span>
        </div>

        {loadingProfiles && (
          <div className="p-6 text-sm text-slate-600">Loading users…</div>
        )}

        {!loadingProfiles && shownProfiles.length === 0 && (
          <div className="p-6 text-sm text-slate-500">No registered users found. Users appear here after signing up and confirming their email.</div>
        )}

        {!loadingProfiles && shownProfiles.length > 0 && (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Email</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {shownProfiles.map((profile) => (
                <tr key={profile.id}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{profile.full_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{profile.email ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
