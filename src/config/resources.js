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
 * @returns {string} AllTrails search URL
 */
export function getAllTrailsUrl(trailName) {
  const query = encodeURIComponent(`${trailName} San Mateo County`);
  return `https://www.alltrails.com/search?q=${query}`;
}
