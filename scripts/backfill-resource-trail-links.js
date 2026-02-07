/**
 * Backfill resource_trail_links for San Mateo County resources (Midpen, SMC Parks).
 * Performs a live Overpass API lookup for San Mateo trails, extracts their OSM IDs,
 * and inserts resource_trail_links. No area IDs stored in DB.
 *
 * Run: node scripts/backfill-resource-trail-links.js
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
import { createClient } from '@supabase/supabase-js';
import { fetchSanMateoTrails } from '../src/services/overpassApi.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Use .env.local or set env vars.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SAN_MATEO_RESOURCE_IDS = [1, 2]; // Midpen, SMC Parks

function collectTrailOsmIds(features) {
  const links = [];
  const seen = new Set();

  for (const f of features) {
    const props = f.properties || {};

    const add = (osmType, osmId) => {
      if (osmId == null || seen.has(`${osmType}:${osmId}`)) return;
      seen.add(`${osmType}:${osmId}`);
      links.push({ osm_type: osmType, osm_id: osmId });
    };

    for (const id of props.osm_way_ids || []) add('way', id);
    if (props.osm_relation_id != null) add('relation', props.osm_relation_id);
  }

  return links;
}

async function main() {
  console.log('Fetching San Mateo County trails from Overpass API...');
  const geojson = await fetchSanMateoTrails();
  const features = geojson?.features ?? [];
  console.log(`  ${features.length} trail features`);

  const trailLinks = collectTrailOsmIds(features);
  console.log(`  ${trailLinks.length} unique trail OSM IDs`);

  if (trailLinks.length === 0) {
    console.log('No San Mateo trails found.');
    return;
  }

  const rows = [];
  for (const resourceId of SAN_MATEO_RESOURCE_IDS) {
    for (const { osm_type, osm_id } of trailLinks) {
      rows.push({ resource_id: resourceId, osm_type, osm_id });
    }
  }

  console.log(`Upserting ${rows.length} resource_trail_links...`);

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('resource_trail_links').upsert(chunk, {
      onConflict: 'resource_id,osm_type,osm_id',
    });
    if (error) throw error;
    console.log(`  ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
