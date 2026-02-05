/**
 * Spatial analysis utilities using Turf.js
 * Performs buffering and spatial joins between trails and observations
 */

import * as turf from '@turf/turf';

// Buffer distance in meters
const BUFFER_DISTANCE_METERS = 50;

/**
 * Calculate observation density for each trail
 * Creates a 50m buffer around each trail and counts observations within
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
    // Return trails with 0 counts
    return trails.features.map(trail => ({
      name: trail.properties.name,
      observationCount: 0,
      trail: trail,
      observationsNearby: [],
    }));
  }

  const results = [];

  for (const trail of trails.features) {
    try {
      // Create 50m buffer around the trail
      // Turf.js buffer works with any geometry type
      const buffer = turf.buffer(trail, BUFFER_DISTANCE_METERS, { units: 'meters' });

      if (!buffer) {
        console.warn(`Could not create buffer for trail: ${trail.properties.name}`);
        results.push({
          name: trail.properties.name,
          observationCount: 0,
          trail: trail,
          observationsNearby: [],
        });
        continue;
      }

      // Find observations within the buffer
      const pointsInBuffer = turf.pointsWithinPolygon(observations, buffer);

      results.push({
        name: trail.properties.name,
        observationCount: pointsInBuffer.features.length,
        trail: trail,
        observationsNearby: pointsInBuffer.features.map(f => f.properties),
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

  // Sort by observation count descending
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
 * Get unique species observed near trails
 */
export function getSpeciesBreakdown(results) {
  const speciesCounts = new Map();

  for (const result of results) {
    for (const obs of result.observationsNearby) {
      const species = obs.species || 'Unknown';
      speciesCounts.set(species, (speciesCounts.get(species) || 0) + 1);
    }
  }

  return Array.from(speciesCounts.entries())
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count);
}
