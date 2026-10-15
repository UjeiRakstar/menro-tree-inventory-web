import { useCallback, useEffect, useId, useMemo, useState } from 'react';
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
  // Each LGU's CLIRAM figures (map_layers.sql), for the areas' rainfall and temperature.
  const [climate, setClimate] = useState(() => new Map());
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [areas, lgus, proposals, climates] = await Promise.all([
      supabase.from('map_areas').select('*').order('created_at', { ascending: true }),
      supabase.from('lgus').select('psgc, label'),
      withProposals
        ? supabase.from('map_area_proposals').select('*').eq('status', 'pending')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('lgu_climate').select('*'),
    ]);
    setMissing(isMissingTable(areas.error));
    setError(areas.error && !isMissingTable(areas.error) ? areas.error.message : '');
    setRows(Array.isArray(areas.data) ? areas.data : []);
    setLabels(new Map((Array.isArray(lgus.data) ? lgus.data : []).map((lgu) => [Number(lgu.psgc), lgu.label])));
    setPending(Array.isArray(proposals.data) ? proposals.data : []);
    setClimate(new Map((!climates.error && Array.isArray(climates.data) ? climates.data : []).map((c) => [Number(c.lgu_psgc), c])));
  }, [withProposals]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Live: an area saved, edited or deleted anywhere, or a proposal made or
  // decided, shows without a refresh (supabase/live_updates.sql). A burst of
  // changes — an approval touches both tables — becomes one reload. And on
  // coming back to the tab, in case anything was missed while it slept.
  // useId has colons, which a channel name uses as its own separator.
  const channelName = `map-areas-${useId().replace(/:/g, '')}`;
  useEffect(() => {
    let timer = null;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reload(), 300);
    };
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_areas' }, soon);
    if (withProposals) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'map_area_proposals' }, soon);
    }
    channel.subscribe();
    const onVisible = () => {
      if (document.visibilityState === 'visible') soon();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', soon);
    return () => {
      clearTimeout(timer);
      supabase.removeChannel?.(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', soon);
    };
  }, [reload, withProposals, channelName]);

  const features = useMemo(
    () =>
      rows.map((row) =>
        rowToFeature(row, {
          lguLabel: labels.get(Number(row.lgu_psgc)) ?? '',
          climate: climate.get(Number(row.lgu_psgc)) ?? null,
        })
      ),
    [rows, labels, climate]
  );
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const proposals = useMemo(() => new Map(pending.map((proposal) => [proposal.area_id, proposal])), [pending]);

  return { features, rowsById, proposals, missing, error, reload };
}
