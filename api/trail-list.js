/**
 * Optimized API for the Trail List view: returns only top 10 trails and top 10 species.
 * Use this for the list tab instead of fetching full trail-counts.
 */
import { supabase } from '../lib/supabase.js';

const VALID_STATES = ['ca', 'or', 'wa'];
const TOP_TRAILS_LIMIT = 10;
const TOP_SPECIES_LIMIT = 10;

/** Fetch iNaturalist taxon_id for a species name (fallback when DB lacks it) */
async function fetchTaxonIdForSpecies(speciesName) {
  if (!speciesName || speciesName === 'Unknown') return null;
  try {
    const res = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(speciesName)}&per_page=1`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const taxon = data.results?.[0];
    return taxon?.id ?? null;
  } catch {
    return null;
  }
}

/** Enrich species with taxon_id by looking up missing ones in iNaturalist */
async function enrichWithTaxonIds(topTrails, topSpecies) {
  const missing = new Set();
  for (const item of topSpecies) {
    if (!item.taxon_id && item.species) missing.add(item.species);
  }
  for (const trail of topTrails) {
    for (const s of trail.species_breakdown || []) {
      if (!s.taxon_id && s.species) missing.add(s.species);
    }
  }
  if (missing.size === 0) return;
  const lookup = await Promise.all(
    Array.from(missing).map(async (name) => {
      const id = await fetchTaxonIdForSpecies(name);
      return [name, id];
    })
  );
  const taxonMap = Object.fromEntries(lookup.filter(([, id]) => id != null));

  for (const item of topSpecies) {
    if (!item.taxon_id && taxonMap[item.species]) {
      item.taxon_id = taxonMap[item.species];
    }
  }
  for (const trail of topTrails) {
    for (const s of trail.species_breakdown || []) {
      if (!s.taxon_id && taxonMap[s.species]) {
        s.taxon_id = taxonMap[s.species];
      }
    }
  }
}

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
    const speciesCounts = new Map(); // species -> { count, taxon_id }
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
          const addCount = item?.count ?? 1;
          const taxonId = item?.taxon_id ?? null;
          const existing = speciesCounts.get(name) || { count: 0, taxon_id: null };
          speciesCounts.set(name, {
            count: existing.count + addCount,
            taxon_id: existing.taxon_id ?? taxonId,
          });
        }
      }
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const topSpecies = Array.from(speciesCounts.entries())
      .map(([species, { count, taxon_id }]) => ({ species, count, taxon_id: taxon_id || undefined }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_SPECIES_LIMIT);

    const summary = {
      trailsWithObservations,
      totalObservations,
    };

    // Enrich with taxon_id from iNaturalist when missing (e.g. before observations backfill)
    await enrichWithTaxonIds(topTrails, topSpecies);

    res.setHeader('Cache-Control', 's-maxage=86400'); // 24h
    return res.status(200).json({ topTrails, topSpecies, summary });
  } catch (err) {
    console.error('Trail list API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
