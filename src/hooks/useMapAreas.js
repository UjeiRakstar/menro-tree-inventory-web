import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { rowToFeature } from '../lib/mapAreas.js';

/** PostgREST's ways of saying a table is not there yet. */
const isMissingTable = (error) =>
  Boolean(error) && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? ''));

/**
 * The areas offices have saved (supabase/map_areas.sql), as map features —
 * and, for the office map, the PGENRO proposals waiting on a decision.
 *
 *   features     every saved area, ready for the map and its panel
 *   rowsById     the saved rows, for editing
 *   proposals    Map(area id → its pending proposal)
 *   missing      map_areas.sql has not been run: nothing to load, not an error
 *   reload()     after a save, an edit, a delete or a decision
 *
 * The database already decides what each account sees, training wall
 * included; nothing is filtered here.
 */
export function useMapAreas({ withProposals = false } = {}) {
  const [rows, setRows] = useState([]);
  const [labels, setLabels] = useState(() => new Map());
  const [pending, setPending] = useState([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [areas, lgus, proposals] = await Promise.all([
      supabase.from('map_areas').select('*').order('created_at', { ascending: true }),
      supabase.from('lgus').select('psgc, label'),
      withProposals
        ? supabase.from('map_area_proposals').select('*').eq('status', 'pending')
        : Promise.resolve({ data: [], error: null }),
    ]);
    setMissing(isMissingTable(areas.error));
    setError(areas.error && !isMissingTable(areas.error) ? areas.error.message : '');
    setRows(Array.isArray(areas.data) ? areas.data : []);
    setLabels(new Map((Array.isArray(lgus.data) ? lgus.data : []).map((lgu) => [Number(lgu.psgc), lgu.label])));
    setPending(Array.isArray(proposals.data) ? proposals.data : []);
  }, [withProposals]);

  useEffect(() => {
    reload();
  }, [reload]);

  const features = useMemo(
    () => rows.map((row) => rowToFeature(row, { lguLabel: labels.get(Number(row.lgu_psgc)) ?? '' })),
    [rows, labels]
  );
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const proposals = useMemo(() => new Map(pending.map((proposal) => [proposal.area_id, proposal])), [pending]);

  return { features, rowsById, proposals, missing, error, reload };
}
