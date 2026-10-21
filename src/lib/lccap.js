import { supabase } from '../supabaseClient.js';

/**
 * An LGU's Local Climate Change Action Plan, filed with PGENRO and checked by
 * its CCAMD (supabase/lccap.sql, 21 October).
 *
 * Two badges follow from a verified plan: "LCCAP on file" while its years
 * run, and "Submitted to the CCC" when the Climate Change Commission's
 * Certificate of Receipt came with it. The certificate says the Commission
 * received the plan; it is not an approval, and the badge does not call it one.
 */

export const LCCAP_BUCKET = 'lccap-documents';
export const MAX_LCCAP_BYTES = 50 * 1024 * 1024;
export const PLAN_TYPES = ['application/pdf'];
export const RECEIPT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

export const PLAN_KINDS = Object.freeze([
  { id: 'elccap', label: 'eLCCAP (enhanced)' },
  { id: 'lccap', label: 'LCCAP' },
]);
export const planKindLabel = (id) => (id === 'elccap' ? 'eLCCAP' : 'LCCAP');

/** What is wrong with a filing before it is sent; empty when it can go. */
export function lccapProblems({ termStart, termEnd, plan, receipt }) {
  const problems = {};
  const start = Number(termStart);
  const end = Number(termEnd);
  if (!Number.isInteger(start) || start < 2000 || start > 2100) problems.termStart = 'Give the year the plan starts.';
  if (!Number.isInteger(end) || end < 2000 || end > 2100) problems.termEnd = 'Give the year the plan ends.';
  else if (!problems.termStart && end < start) problems.termEnd = 'It cannot end before it starts.';
  else if (!problems.termStart && end - start > 15) problems.termEnd = 'A plan covers at most fifteen years.';
  if (!plan) problems.plan = 'Attach the plan, as a PDF.';
  else if (!PLAN_TYPES.includes(plan.type) || plan.size > MAX_LCCAP_BYTES) problems.plan = 'The plan must be a PDF under 50 MB.';
  if (receipt && (!RECEIPT_TYPES.includes(receipt.type) || receipt.size > MAX_LCCAP_BYTES)) {
    problems.receipt = 'The certificate must be a PDF, PNG or JPEG under 50 MB.';
  }
  return problems;
}

/** A file into the LGU's folder, under a name nobody can guess; its public URL. */
export async function uploadLccapFile(lguPsgc, file, what) {
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${lguPsgc}/${what}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(LCCAP_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(LCCAP_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * The badges an LGU shows, from its verified plans: the latest one whose
 * years include `year`, and whether it went to the CCC. Null when none.
 */
export function planBadges(plans, lguPsgc, year = new Date().getFullYear()) {
  const current = (Array.isArray(plans) ? plans : [])
    .filter((p) => p.status === 'verified' && Number(p.lgu_psgc) === Number(lguPsgc) && p.term_start <= year && p.term_end >= year)
    .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))[0];
  if (!current) return null;
  return { plan: current, onFile: true, toCcc: Boolean(current.receipt_url) };
}

/** Every verified plan, read once per page (the public sees these). */
let loading = null;
export function loadVerifiedPlans() {
  if (!loading) {
    loading = (async () => {
      try {
        const { data, error } = await supabase.from('lccap_submissions').select('*').eq('status', 'verified');
        return error || !Array.isArray(data) ? [] : data;
      } catch {
        return [];
      }
    })();
  }
  return loading;
}

/** For tests, and after a plan is verified: read again. */
export function forgetVerifiedPlans() {
  loading = null;
}

/** PostgREST's "no such table": lccap.sql has not been run yet. */
export const lccapMissing = (error) => /lccap_submissions|does not exist|Could not find the table/i.test(error?.message ?? '');
