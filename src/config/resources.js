/**
 * External resource links for wildflower information
 */

export const WILDFLOWER_RESOURCES = [
  {
    name: 'Midpen Wildflower Guide',
    url: 'https://www.openspace.org/where-to-go/nature/wildflowers',
    description: 'Midpeninsula Regional Open Space District',
  },
  {
    name: 'SMC Parks Spring Flowers',
    url: 'https://www.smcgov.org/parks/news/enjoy-wildflowers-san-mateo-county-park-spring',
    description: 'San Mateo County Parks Department',
  },
];

/**
 * Generate AllTrails search URL for a trail
 * @param {string} trailName - Name of the trail
 * @param {string} [stateName] - State name (e.g. "California") for better search results
 * @returns {string} AllTrails search URL
 */
export function getAllTrailsUrl(trailName, stateName = 'California') {
  const query = encodeURIComponent(`${trailName} ${stateName}`);
  return `https://www.alltrails.com/search?q=${query}`;
}

/**
 * Generate iNaturalist URL for a species
 * Prefers taxon_id when available for direct linking; falls back to taxon_name search.
 * @param {number|string|null} taxonId - iNaturalist taxon ID (preferred)
 * @param {string} [speciesName] - Scientific or common name (fallback when no taxon_id)
 * @returns {string} iNaturalist observations URL
 */
export function getINaturalistSpeciesUrl(taxonId, speciesName = '') {
  if (taxonId != null && taxonId !== '') {
    return `https://www.inaturalist.org/observations?taxon_id=${taxonId}&view=species`;
  }
  const taxon = encodeURIComponent(speciesName || '');
  return `https://www.inaturalist.org/observations?taxon_name=${taxon}`;
}
