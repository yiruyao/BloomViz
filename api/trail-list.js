/**
 * Optimized API for the Trail List view: returns only top 10 trails and top 10 species.
 * Use this for the list tab instead of fetching full trail-counts.
 */
import { supabase } from '../lib/supabase.js';

const VALID_STATES = ['ca', 'or', 'wa'];
const TOP_TRAILS_LIMIT = 10;
const TOP_SPECIES_LIMIT = 10;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const state = req.query.state?.toLowerCase();
  if (!state || !VALID_STATES.includes(state)) {
    return res.status(400).json({ error: 'Invalid state. Use ca, or, or wa.' });
  }

  try {
    // 1) Top 10 trails by observation count (single query, no pagination)
    const { data: topTrailsRows, error: trailsError } = await supabase
      .from('trail_observation_counts')
      .select('trail_name, observation_count, species_breakdown')
      .eq('state', state)
      .order('observation_count', { ascending: false })
      .limit(TOP_TRAILS_LIMIT);

    if (trailsError) throw trailsError;

    const topTrails = (topTrailsRows || []).map((row) => ({
      trail_name: row.trail_name,
      observation_count: row.observation_count ?? 0,
      species_breakdown: Array.isArray(row.species_breakdown) ? row.species_breakdown : [],
    }));

    // 2) All rows for this state (only species_breakdown + observation_count) to aggregate top species and summary
    const speciesCounts = new Map();
    let totalObservations = 0;
    let trailsWithObservations = 0;
    const PAGE_SIZE = 500;
    let offset = 0;

    while (true) {
      const { data: rows, error: aggError } = await supabase
        .from('trail_observation_counts')
        .select('observation_count, species_breakdown')
        .eq('state', state)
        .range(offset, offset + PAGE_SIZE - 1);

      if (aggError) throw aggError;
      if (!rows?.length) break;

      for (const row of rows) {
        const count = row.observation_count ?? 0;
        totalObservations += count;
        if (count > 0) trailsWithObservations += 1;
        const breakdown = Array.isArray(row.species_breakdown) ? row.species_breakdown : [];
        for (const item of breakdown) {
          const name = item?.species || 'Unknown';
          speciesCounts.set(name, (speciesCounts.get(name) || 0) + (item?.count ?? 1));
        }
      }
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const topSpecies = Array.from(speciesCounts.entries())
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_SPECIES_LIMIT);

    const summary = {
      trailsWithObservations,
      totalObservations,
    };

    res.setHeader('Cache-Control', 's-maxage=86400'); // 24h
    return res.status(200).json({ topTrails, topSpecies, summary });
  } catch (err) {
    console.error('Trail list API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
