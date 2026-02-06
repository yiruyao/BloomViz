/**
 * Trails API: reads trail GeoJSON from Supabase only (no Overpass at runtime).
 * Table is populated by scripts/generate-trails.js (Overpass backfill).
 */
import { supabase } from '../../lib/supabase.js';

const VALID_STATES = ['ca', 'or', 'wa'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { state } = req.query;
  const stateLower = state?.toLowerCase();

  if (!stateLower || !VALID_STATES.includes(stateLower)) {
    return res.status(400).json({ error: 'Invalid state. Use ca, or, or wa.' });
  }

  try {
    // Only include trails that have observations (trail_observation_counts); reduces payload and we don't show zero-observation trails
    let trailNamesWithObservations = null;
    const countPageSize = 500;
    let countOffset = 0;
    const namesSet = new Set();
    while (true) {
      const { data: countRows, error: countError } = await supabase
        .from('trail_observation_counts')
        .select('trail_name')
        .eq('state', stateLower)
        .gt('observation_count', 0)
        .range(countOffset, countOffset + countPageSize - 1);
      if (countError) break; // table missing or error: fall back to returning all trails
      if (!countRows?.length) break;
      countRows.forEach((r) => namesSet.add(r.trail_name));
      if (countRows.length < countPageSize) break;
      countOffset += countPageSize;
    }
    if (namesSet.size > 0) trailNamesWithObservations = namesSet;

    const PAGE_SIZE = 1; // one chunk per request to stay under Supabase statement timeout (geojson can be large)
    const allRows = [];
    let offset = 0;

    while (true) {
      const { data: rows, error } = await supabase
        .from('trails')
        .select('geojson')
        .eq('state', stateLower)
        .order('chunk_id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!rows?.length) break;
      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (!allRows.length) {
      return res.status(404).json({ error: 'Trails not found for this state. Run generate-trails script first.' });
    }

    let features = allRows.flatMap((r) => r.geojson?.features ?? []);
    if (trailNamesWithObservations) {
      features = features.filter((f) => trailNamesWithObservations.has(f.properties?.name));
    }
    const geojson = { type: 'FeatureCollection', features };

    res.setHeader('Cache-Control', 's-maxage=86400'); // 24h
    return res.status(200).json(geojson);
  } catch (err) {
    console.error('Trails API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
