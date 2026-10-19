import { supabase } from '../supabaseClient.js';

/**
 * The field officers a tree or tag can be sent to: approved, active field
 * officer accounts, as { id, name, email }.
 *
 * Read from the accounts (public.profiles), which accounts.sql fences: a
 * MENRO / CENRO gets its own LGU's officers, PGENRO everyone's. The old list,
 * public.arborists, had no LGU, and listed every officer in Laguna to every
 * office (found 19 October). `lgu`, when given, narrows PGENRO's to one LGU.
 */
export async function loadFieldOfficers(lgu = undefined) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, lgu_psgc, is_approved, status')
    .eq('role', 'field_officer');
  if (error) return { officers: [], error };
  const officers = (Array.isArray(data) ? data : [])
    .filter((p) => p.email && p.is_approved !== false && (p.status ?? 'active') === 'active')
    .filter((p) => lgu === undefined || Number(p.lgu_psgc) === Number(lgu))
    .map((p) => ({ id: p.id, name: p.full_name || p.email, email: p.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { officers, error: null };
}
