/**
 * Pre-compute trail → observation counts and species breakdown, write to trail_observation_counts.
 * Run after observations are updated (e.g. after backfill or cron). Data doesn't change daily.
 *
 * Usage:
 *   node scripts/refresh-trail-counts.js [--state=ca|or|wa]
 *
 * Examples:
 *   node scripts/refresh-trail-counts.js           # all states
 *   node scripts/refresh-trail-counts.js --state=ca
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';
import { calculateTrailDensity } from '../src/utils/spatialAnalysis.js';

const VALID_STATES = ['ca', 'or', 'wa'];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  return createClient(url, key);
}

function speciesBreakdownForTrail(observationsNearby) {
  const counts = new Map(); // species -> { count, taxon_id }
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

const TRAILS_PAGE = 10;   // trail chunks per request (avoids statement timeout)
const OBS_PAGE = 500;     // observations per request
const UPSERT_BATCH = 300; // rows per upsert batch

async function getTrailsGeoJSON(supabase, state) {
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

async function getObservationsGeoJSON(supabase, state) {
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

async function refreshState(supabase, state) {
  console.log(`[${state}] Loading trails and observations...`);
  const [trails, observations] = await Promise.all([
    getTrailsGeoJSON(supabase, state),
    getObservationsGeoJSON(supabase, state),
  ]);
  const trailCount = trails.features?.length ?? 0;
  const obsCount = observations.features?.length ?? 0;
  console.log(`[${state}] Trails: ${trailCount}, Observations: ${obsCount}`);

  console.log(`[${state}] Running spatial analysis...`);
  const results = calculateTrailDensity(trails, observations);

  const rows = results.map((r) => ({
    state,
    trail_name: r.name,
    observation_count: r.observationCount,
    species_breakdown: speciesBreakdownForTrail(r.observationsNearby),
  }));

  if (rows.length === 0) {
    console.log(`[${state}] No trails to upsert.`);
    return;
  }

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from('trail_observation_counts')
      .upsert(batch, { onConflict: 'state,trail_name' });
    if (error) throw error;
  }
  console.log(`[${state}] Upserted ${rows.length} trail counts.`);
}

function parseArgs() {
  const stateArg = process.argv.slice(2).find((a) => a.startsWith('--state='));
  const state = stateArg ? stateArg.slice(8).toLowerCase() : null;
  const states = state && VALID_STATES.includes(state) ? [state] : VALID_STATES;
  return states;
}

async function main() {
  const states = parseArgs();
  const supabase = getSupabase();
  for (const state of states) {
    await refreshState(supabase, state);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
