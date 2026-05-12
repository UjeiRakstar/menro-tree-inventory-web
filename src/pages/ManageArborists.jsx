import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { Users, UserPlus, Trash2 } from 'lucide-react';

export default function ManageArborists() {
  const [arborists, setArborists] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loadingArborists, setLoadingArborists] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [taskCounts, setTaskCounts] = useState({}); // { email: { assigned: N, cancelled: N } }

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');

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
      const { data } = await supabase.from('trees').select('assigned_to, task_status');
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

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email || !temporaryPassword) {
      alert('Email and temporary password are required.');
      return;
    }

    // 1. Create auth account so the arborist can log into the mobile app
    const { error: authError } = await supabase.auth.signUp({
      email,
      password: temporaryPassword,
      options: {
        data: { full_name: name, role: 'arborist' },
      },
    });

    if (authError) {
      console.error('Failed to create auth account:', authError.message);
      alert(`Auth error: ${authError.message}`);
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
      return;
    }

    if (data && data.length > 0) {
      setArborists((prev) => [...prev, data[0]]);
    }

    setName('');
    setEmail('');
    setContactNumber('');
    setTemporaryPassword('');
  }

  async function handleDeleteArborist(arboristId) {
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

      {errorMessage && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

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
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Full Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email Address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Contact Number</span>
            <input
              type="text"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Temporary Password</span>
            <input
              type="password"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
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
            {arborists.length} records
          </span>
        </div>

        {loadingArborists && (
          <div className="p-6 text-sm text-slate-600">Loading arborists…</div>
        )}

        {!loadingArborists && arborists.length === 0 && (
          <div className="p-6 text-sm text-slate-500">No arborists found.</div>
        )}

        {!loadingArborists && arborists.length > 0 && (
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
              {arborists.map((arborist) => {
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
            {profiles.length} users
          </span>
        </div>

        {loadingProfiles && (
          <div className="p-6 text-sm text-slate-600">Loading users…</div>
        )}

        {!loadingProfiles && profiles.length === 0 && (
          <div className="p-6 text-sm text-slate-500">No registered users found. Users appear here after signing up and confirming their email.</div>
        )}

        {!loadingProfiles && profiles.length > 0 && (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Email</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {profiles.map((profile) => (
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
