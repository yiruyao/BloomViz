/**
 * Shared logic for refreshing trail_observation_counts (used by cron API and scripts).
 * Loads trails + observations from Supabase, runs spatial analysis, upserts counts.
 */

import { calculateTrailDensity } from '../../src/utils/spatialAnalysis.js';

const TRAILS_PAGE = 10;
const OBS_PAGE = 500;
const UPSERT_BATCH = 300;

function speciesBreakdownForTrail(observationsNearby) {
  const counts = new Map();
  for (const o of observationsNearby || []) {
    const s = o.species || 'Unknown';
    const existing = counts.get(s) || { count: 0, taxon_id: null };
    counts.set(s, {
      count: existing.count + 1,
      taxon_id: existing.taxon_id ?? o.taxonId ?? null,
    });
  }
  return Array.from(counts.entries()).map(([species, { count, taxon_id }]) => ({
    species,
    count,
    taxon_id: taxon_id || undefined,
  }));
}

export async function getTrailsGeoJSON(supabase, state) {
  const allRows = [];
  let offset = 0;
  while (true) {
    const { data: rows, error } = await supabase
      .from('trails')
      .select('geojson')
      .eq('state', state)
      .order('chunk_id', { ascending: true })
      .range(offset, offset + TRAILS_PAGE - 1);
    if (error) throw error;
    if (!rows?.length) break;
    allRows.push(...rows);
    if (rows.length < TRAILS_PAGE) break;
    offset += TRAILS_PAGE;
  }
  const features = allRows.flatMap((r) => r.geojson?.features ?? []);
  return { type: 'FeatureCollection', features };
}

export async function getObservationsGeoJSON(supabase, state) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().split('T')[0];

  const allData = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('observations')
      .select('id, species, scientific_name, taxon_id, observed_on, quality_grade, user_login, photo_url, geojson')
      .eq('state', state)
      .gte('observed_on', dateStr)
      .order('observed_on', { ascending: false })
      .range(offset, offset + OBS_PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    allData.push(...data);
    if (data.length < OBS_PAGE) break;
    offset += OBS_PAGE;
  }

  const features = allData.map((obs) => ({
    type: 'Feature',
    properties: {
      id: obs.id,
      species: obs.species,
      scientificName: obs.scientific_name,
      taxonId: obs.taxon_id,
      observedOn: obs.observed_on,
      qualityGrade: obs.quality_grade,
      userId: obs.user_login,
      photoUrl: obs.photo_url,
    },
    geometry: obs.geojson,
  }));
  return { type: 'FeatureCollection', features };
}

/**
 * Refresh trail_observation_counts for one state. Returns { trailsLoaded, observationsLoaded, rowsUpserted }.
 */
export async function refreshOneState(supabase, state) {
  const [trails, observations] = await Promise.all([
    getTrailsGeoJSON(supabase, state),
    getObservationsGeoJSON(supabase, state),
  ]);
  const trailCount = trails.features?.length ?? 0;
  const obsCount = observations.features?.length ?? 0;

  const results = calculateTrailDensity(trails, observations);
  const rows = results.map((r) => ({
    state,
    trail_name: r.name,
    observation_count: r.observationCount,
    species_breakdown: speciesBreakdownForTrail(r.observationsNearby),
  }));

  if (rows.length === 0) {
    return { trailsLoaded: trailCount, observationsLoaded: obsCount, rowsUpserted: 0 };
  }

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from('trail_observation_counts')
      .upsert(batch, { onConflict: 'state,trail_name' });
    if (error) throw error;
  }

  return { trailsLoaded: trailCount, observationsLoaded: obsCount, rowsUpserted: rows.length };
}
