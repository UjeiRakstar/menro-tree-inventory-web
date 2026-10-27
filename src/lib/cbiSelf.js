import { supabase } from '../supabaseClient.js';
import { SELF_ASSESSED } from './cbiPoints.js';

/**
 * An office's self-assessment toward the City / Urban Biodiversity Index
 * (cbi_ubi.sql), one year at a time: { [indicator no]: { points, value, note } },
 * the shape cbiPoints() takes as `self`.
 */

/** The PostgREST "no such table": cbi_ubi.sql not run yet. */
export const isMissingTable = (error) =>
  error?.code === '42P01' || error?.code === 'PGRST205' || /cbi_self_assessments/.test(error?.message ?? '');

/** { entries, missing } — missing when the table is not there yet. */
export async function loadSelfAssessment(lguPsgc, year) {
  if (!lguPsgc) return { entries: {}, missing: false };
  const { data, error } = await supabase
    .from('cbi_self_assessments')
    .select('indicator, points, value, note, updated_at')
    .eq('lgu_psgc', Number(lguPsgc))
    .eq('year', Number(year));
  if (error) return { entries: {}, missing: isMissingTable(error), error };
  const entries = {};
  for (const row of Array.isArray(data) ? data : []) {
    entries[Number(row.indicator)] = {
      points: row.points === null || row.points === undefined ? null : Number(row.points),
      value: row.value === null || row.value === undefined ? null : Number(row.value),
      note: row.note ?? '',
      updatedAt: row.updated_at ?? null,
    };
  }
  return { entries, missing: false };
}

/**
 * What the form holds, as rows to keep and indicators to clear, against what
 * was saved: an indicator left blank that had an entry is removed.
 *   form   { [no]: { points: '' | '0'…'4', value: '' | '12.5', note } }
 */
export function selfAssessmentChanges(form, saved, { lguPsgc, year }) {
  const upserts = [];
  const cleared = [];
  for (const indicator of SELF_ASSESSED) {
    const entry = form[indicator.no] ?? {};
    const note = String(entry.note ?? '').trim() || null;
    const given = indicator.self === 'level' ? String(entry.points ?? '') !== '' : String(entry.value ?? '').trim() !== '';
    if (given) {
      upserts.push({
        lgu_psgc: Number(lguPsgc),
        year: Number(year),
        indicator: indicator.no,
        points: indicator.self === 'level' ? Number(entry.points) : null,
        value: indicator.self === 'value' ? Number(String(entry.value).trim()) : null,
        note,
      });
    } else if (saved[indicator.no]) {
      cleared.push(indicator.no);
    }
  }
  return { upserts, cleared };
}

/** A figure that is not a number, by indicator; empty when the form can be saved. */
export function selfAssessmentProblems(form) {
  const problems = {};
  for (const indicator of SELF_ASSESSED.filter((i) => i.self === 'value')) {
    const raw = String(form[indicator.no]?.value ?? '').trim();
    if (raw && !Number.isFinite(Number(raw))) problems[indicator.no] = 'A number, please.';
    else if (raw && indicator.inputUnit === '%' && (Number(raw) < 0 || Number(raw) > 100)) problems[indicator.no] = 'Between 0 and 100.';
    else if (raw && !['species'].includes(indicator.inputUnit) && Number(raw) < 0) problems[indicator.no] = 'Not below zero.';
  }
  return problems;
}

export async function saveSelfAssessment({ upserts, cleared }, { lguPsgc, year }) {
  if (upserts.length) {
    const { error } = await supabase.from('cbi_self_assessments').upsert(upserts, { onConflict: 'lgu_psgc,year,indicator' });
    if (error) return error;
  }
  if (cleared.length) {
    const { error } = await supabase
      .from('cbi_self_assessments')
      .delete()
      .eq('lgu_psgc', Number(lguPsgc))
      .eq('year', Number(year))
      .in('indicator', cleared);
    if (error) return error;
  }
  return null;
}
