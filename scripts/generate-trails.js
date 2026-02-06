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

async function main() {
  for (const [stateCode, name] of Object.entries(STATE_NAMES)) {
    console.log(`Fetching trails for ${name}...`);
    try {
      const geojson = await fetchTrailsForState(name);
      const count = geojson?.features?.length ?? 0;
      console.log(`  ${count} trail features`);

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
