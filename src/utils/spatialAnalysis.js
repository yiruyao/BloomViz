/**
 * Spatial analysis utilities using Turf.js
 * Performs buffering and spatial joins between trails and observations.
 * Uses a grid index on observations to avoid O(trails × observations) point-in-polygon work.
 */

import * as turf from '@turf/turf';

// Buffer distance in meters
const BUFFER_DISTANCE_METERS = 50;

// Grid cell size in degrees (~1km at mid-latitudes). Observations in the same cell as a trail's bbox are candidates.
const GRID_CELL_DEG = 0.01;

/**
 * Build a simple grid index: cellKey -> [observation features].
 * Each point is assigned to one cell; trail buffers only query overlapping cells.
 */
function buildObservationGrid(observations) {
  const grid = new Map();
  for (const f of observations.features) {
    const coords = turf.getCoord(f);
    const [lng, lat] = coords;
    const key = `${Math.floor(lng / GRID_CELL_DEG)},${Math.floor(lat / GRID_CELL_DEG)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(f);
  }
  return grid;
}

/**
 * Get observation features that fall inside a bbox (by grid cells). May include a few outside bbox.
 */
function getCandidatesInBbox(grid, bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  const minCellX = Math.floor(minX / GRID_CELL_DEG);
  const maxCellX = Math.floor(maxX / GRID_CELL_DEG);
  const minCellY = Math.floor(minY / GRID_CELL_DEG);
  const maxCellY = Math.floor(maxY / GRID_CELL_DEG);
  const candidates = [];
  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cy = minCellY; cy <= maxCellY; cy++) {
      const key = `${cx},${cy}`;
      const cell = grid.get(key);
      if (cell) candidates.push(...cell);
    }
  }
  return candidates;
}

/**
 * Calculate observation density for each trail
 * Creates a 50m buffer around each trail and counts observations within.
 * Uses a grid index so we only run point-in-polygon on observations in nearby cells.
 *
 * @param {FeatureCollection} trails - GeoJSON FeatureCollection of trail LineStrings/MultiLineStrings
 * @param {FeatureCollection} observations - GeoJSON FeatureCollection of observation Points
 * @returns {Array} Array of { name, observationCount, trail } objects sorted by count desc
 */
export function calculateTrailDensity(trails, observations) {
  if (!trails?.features?.length) {
    console.warn('No trails provided for analysis');
    return [];
  }

  if (!observations?.features?.length) {
    console.warn('No observations provided for analysis');
    return trails.features.map((trail) => ({
      name: trail.properties.name,
      observationCount: 0,
      trail: trail,
      observationsNearby: [],
    }));
  }

  const grid = buildObservationGrid(observations);
  const results = [];

  for (const trail of trails.features) {
    try {
      const buffer = turf.buffer(trail, BUFFER_DISTANCE_METERS, { units: 'meters' });
      if (!buffer) {
        results.push({
          name: trail.properties.name,
          observationCount: 0,
          trail: trail,
          observationsNearby: [],
        });
        continue;
      }

      const bbox = turf.bbox(buffer);
      const candidates = getCandidatesInBbox(grid, bbox);
      if (candidates.length === 0) {
        results.push({
          name: trail.properties.name,
          observationCount: 0,
          trail: trail,
          observationsNearby: [],
        });
        continue;
      }

      const candidateCollection = { type: 'FeatureCollection', features: candidates };
      const pointsInBuffer = turf.pointsWithinPolygon(candidateCollection, buffer);

      results.push({
        name: trail.properties.name,
        observationCount: pointsInBuffer.features.length,
        trail: trail,
        observationsNearby: pointsInBuffer.features.map((f) => f.properties),
      });
    } catch (error) {
      console.error(`Error processing trail ${trail.properties.name}:`, error);
      results.push({
        name: trail.properties.name,
        observationCount: 0,
        trail: trail,
        observationsNearby: [],
        error: error.message,
      });
    }
  }

  results.sort((a, b) => b.observationCount - a.observationCount);
  return results;
}

/**
 * Get summary statistics for the analysis
 */
export function getAnalysisSummary(results) {
  const totalTrails = results.length;
  const trailsWithObservations = results.filter(r => r.observationCount > 0).length;
  const totalObservationsNearTrails = results.reduce((sum, r) => sum + r.observationCount, 0);
  const maxCount = results.length > 0 ? results[0].observationCount : 0;
  const avgCount = totalTrails > 0 ? totalObservationsNearTrails / totalTrails : 0;

  return {
    totalTrails,
    trailsWithObservations,
    totalObservationsNearTrails,
    maxCount,
    avgCount: avgCount.toFixed(1),
    bufferDistance: BUFFER_DISTANCE_METERS,
  };
}

/**
 * Get unique species observed near trails.
 * Handles both legacy results (observationsNearby) and precomputed results (speciesBreakdown).
 */
export function getSpeciesBreakdown(results) {
  const speciesCounts = new Map();

  for (const result of results) {
    if (result.speciesBreakdown?.length) {
      for (const { species, count } of result.speciesBreakdown) {
        const s = species || 'Unknown';
        speciesCounts.set(s, (speciesCounts.get(s) || 0) + count);
      }
    } else if (result.observationsNearby?.length) {
      for (const obs of result.observationsNearby) {
        const species = obs.species || 'Unknown';
        speciesCounts.set(species, (speciesCounts.get(species) || 0) + 1);
      }
    }
  }

  return Array.from(speciesCounts.entries())
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Build results array from trails GeoJSON + precomputed counts (from trail_observation_counts table).
 * Use this when the backend has already run spatial analysis; avoids client-side work.
 */
export function buildResultsFromCounts(trailsGeoJSON, countsArray) {
  if (!trailsGeoJSON?.features?.length) return [];
  const byName = new Map((countsArray || []).map((c) => [c.trail_name, c]));
  const results = trailsGeoJSON.features.map((trail) => {
    const c = byName.get(trail.properties?.name) || {
      observation_count: 0,
      species_breakdown: [],
    };
    return {
      name: trail.properties?.name ?? 'Unknown',
      observationCount: c.observation_count,
      trail,
      observationsNearby: [],
      speciesBreakdown: c.species_breakdown || [],
    };
  });
  results.sort((a, b) => b.observationCount - a.observationCount);
  return results;
}
