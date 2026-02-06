import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
import { createClient } from '@supabase/supabase-js';
import { fetchTrailsForState } from '../src/services/overpassApi.js';
import { STATES } from '../src/config/states.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Use .env.local or set env vars.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const STATE_NAMES = {
  ca: 'California',
  or: 'Oregon',
  wa: 'Washington',
};

function parseArgs() {
  const state = process.argv.find((a) => a.startsWith('--state='));
  return state ? state.slice(8).toLowerCase() : null;
}

const UPSERT_CHUNK_SIZE = 1500;

/** Round coordinates to 4 decimals to keep payload under Supabase limits (520/504) */
function roundCoord(c) {
  return typeof c === 'number' ? Math.round(c * 1e4) / 1e4 : c;
}

function roundCoords(coords) {
  if (Array.isArray(coords[0])) return coords.map(roundCoords);
  return coords.map(roundCoord);
}

/** Shrink GeoJSON (round coords, strip props). Chunked inserts keep each write small. */
function shrinkGeojson(geojson) {
  const features = (geojson?.features ?? []).map((f) => {
    const props = { name: f.properties?.name };
    if (f.properties?.highway) props.highway = f.properties.highway;
    let geom = f.geometry;
    if (geom?.coordinates) {
      geom = { ...geom, coordinates: roundCoords(geom.coordinates) };
    }
    return { type: 'Feature', properties: props, geometry: geom };
  });
  return { type: 'FeatureCollection', features };
}

/** Upsert trails for one state in chunks (one row per chunk). Each write stays small to avoid hanging the DB. */
async function upsertTrailsChunked(stateCode, geojson) {
  const features = geojson.features ?? [];
  for (let i = 0; i < features.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = features.slice(i, i + UPSERT_CHUNK_SIZE);
    const chunkId = Math.floor(i / UPSERT_CHUNK_SIZE);
    const chunkIndex = chunkId + 1;
    const totalChunks = Math.ceil(features.length / UPSERT_CHUNK_SIZE);
    const chunkGeojson = { type: 'FeatureCollection', features: chunk };

    const { error } = await supabase
      .from('trails')
      .upsert(
        { state: stateCode, chunk_id: chunkId, geojson: chunkGeojson, updated_at: new Date().toISOString() },
        { onConflict: 'state,chunk_id' }
      );

    if (error) throw error;
    console.log(`  Chunk ${chunkIndex}/${totalChunks} (${chunk.length} features)`);
  }
  if (features.length === 0) {
    const { error } = await supabase
      .from('trails')
      .upsert(
        { state: stateCode, chunk_id: 0, geojson: { type: 'FeatureCollection', features: [] }, updated_at: new Date().toISOString() },
        { onConflict: 'state,chunk_id' }
      );
    if (error) throw error;
  }
}

async function main() {
  const onlyState = parseArgs();
  const entries = onlyState && STATE_NAMES[onlyState]
    ? [[onlyState, STATE_NAMES[onlyState]]]
    : Object.entries(STATE_NAMES);
  for (const [stateCode, name] of entries) {
    console.log(`Fetching trails for ${name}...`);
    try {
      const raw = await fetchTrailsForState(name);
      const count = raw?.features?.length ?? 0;
      console.log(`  ${count} trail features, compressing...`);

      const geojson = shrinkGeojson(raw);
      console.log(`  Upserting in chunks of ${UPSERT_CHUNK_SIZE}...`);

      await upsertTrailsChunked(stateCode, geojson);
      console.log(`  Saved to Supabase.`);
    } catch (err) {
      console.error(`  Error:`, err.message);
    }
  }
}

main();
