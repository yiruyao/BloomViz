import { supabase } from '../../lib/supabase.js';
import { STATES } from '../lib/states.js';

const INATURALIST_API_URL = 'https://api.inaturalist.org/v1/observations';

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

const BATCH_SIZE = 150;

async function fetchObservationsForPlace(placeId, d1, d2) {
  const all = [];
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const params = new URLSearchParams({
      place_id: placeId,
      quality_grade: 'research,needs_id',
      term_id: 12,
      term_value_id: 13,
      d1,
      d2,
      per_page: 200,
      geo: true,
      order_by: 'observed_on',
      page,
    });

    const res = await fetch(`${INATURALIST_API_URL}?${params}`);
    if (!res.ok) throw new Error(`iNaturalist error: ${res.status}`);
    const data = await res.json();

    if (!data.results?.length) break;
    all.push(...data.results);
    if (data.results.length < 200) break;
    page++;
  }

  return all;
}

function toRows(observations, stateCode) {
  return observations
    .filter((obs) => obs.geojson?.coordinates)
    .map((obs) => ({
      id: obs.id,
      state: stateCode,
      species: obs.taxon?.preferred_common_name || obs.taxon?.name || null,
      scientific_name: obs.taxon?.name || null,
      observed_on: obs.observed_on || null,
      quality_grade: obs.quality_grade || null,
      user_login: obs.user?.login || null,
      photo_url: obs.photos?.[0]?.url?.replace('square', 'small') || null,
      longitude: obs.geojson?.coordinates?.[0] ?? null,
      latitude: obs.geojson?.coordinates?.[1] ?? null,
      geojson: obs.geojson || null,
    }));
}

/** Upsert in batches to avoid Supabase timeouts */
async function upsertBatched(rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('observations').upsert(chunk, {
      onConflict: 'id,state',
    });
    if (error) throw error;
  }
}

export async function refreshOneState(stateCode, d1, d2) {
  const config = STATES[stateCode];
  if (!config) throw new Error(`Unknown state: ${stateCode}`);

  const observations = await fetchObservationsForPlace(config.iNaturalistPlaceId, d1, d2);

  await supabase
    .from('observations')
    .delete()
    .lt('observed_on', d1)
    .eq('state', stateCode);

  const rows = toRows(observations, stateCode);
  if (rows.length > 0) await upsertBatched(rows);

  return { count: rows.length };
}

export default async function handler(req, res) {
  const authHeader = (req.headers && (req.headers.authorization || req.headers['authorization'])) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const d1 = formatDate(sevenDaysAgo);
  const d2 = formatDate(new Date());

  const results = { states: {}, error: null };

  for (const stateCode of Object.keys(STATES)) {
    try {
      const result = await refreshOneState(stateCode, d1, d2);
      results.states[stateCode] = result;
    } catch (err) {
      console.error(`refresh-observations ${stateCode}:`, err);
      results.error = results.error || err.message;
      results.states[stateCode] = { error: err.message };
    }
  }

  return res.status(results.error ? 207 : 200).json(results);
}
