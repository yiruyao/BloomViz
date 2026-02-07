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
  const maxPages = 4;

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
      taxon_id: obs.taxon_id ?? obs.taxon?.id ?? null,
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

/** Delete only the single day that just left the 7-day window (since we run daily). One delete per state, minimal I/O. */
async function deleteOldObservationsChunked(stateCode, d1) {
  const d1Date = new Date(d1 + 'T00:00:00Z');
  d1Date.setUTCDate(d1Date.getUTCDate() - 1);
  const dateToDelete = formatDate(d1Date);
  const { error } = await supabase
    .from('observations')
    .delete()
    .eq('state', stateCode)
    .eq('observed_on', dateToDelete);
  if (error) throw error;
}

/** Upsert-only: no delete. Use for backfilling a date range without wiping older data. */
export async function backfillOneState(stateCode, d1, d2) {
  const config = STATES[stateCode];
  if (!config) throw new Error(`Unknown state: ${stateCode}`);

  const observations = await fetchObservationsForPlace(config.iNaturalistPlaceId, d1, d2);
  const rows = toRows(observations, stateCode);
  if (rows.length > 0) await upsertBatched(rows);

  return { count: rows.length };
}

export async function refreshOneState(stateCode, d1, d2) {
  const config = STATES[stateCode];
  if (!config) throw new Error(`Unknown state: ${stateCode}`);

  const observations = await fetchObservationsForPlace(config.iNaturalistPlaceId, d1, d2);

  await deleteOldObservationsChunked(stateCode, d1);

  const rows = toRows(observations, stateCode);
  if (rows.length > 0) await upsertBatched(rows);

  return { count: rows.length };
}

// No default handler: scheduled crons use refresh-observations-ca, -or, -wa only.
// For manual backfill use scripts/backfill-observations.js or call each state endpoint.
