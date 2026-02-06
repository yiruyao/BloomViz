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

/** Round coordinates to 5 decimals to reduce payload size and avoid 504 on large states */
function roundCoord(c) {
  return typeof c === 'number' ? Math.round(c * 1e5) / 1e5 : c;
}

function roundCoords(coords) {
  if (Array.isArray(coords[0])) return coords.map(roundCoords);
  return coords.map(roundCoord);
}

/** Shrink GeoJSON to avoid Supabase 504: round coords, strip heavy properties */
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

async function main() {
  for (const [stateCode, name] of Object.entries(STATE_NAMES)) {
    console.log(`Fetching trails for ${name}...`);
    try {
      const raw = await fetchTrailsForState(name);
      const count = raw?.features?.length ?? 0;
      console.log(`  ${count} trail features, compressing...`);

      const geojson = shrinkGeojson(raw);

      const { error } = await supabase
        .from('trails')
        .upsert(
          { state: stateCode, geojson, updated_at: new Date().toISOString() },
          { onConflict: 'state' }
        );

      if (error) throw error;
      console.log(`  Saved to Supabase.`);
    } catch (err) {
      console.error(`  Error:`, err.message);
    }
  }
}

main();
