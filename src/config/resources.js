/**
 * External resource links for wildflower information
 * Fetched from API with trail_links (osm_type, osm_id); filtered by trail OSM IDs.
 */

/**
 * Check if a resource has a trail link matching the trail's OSM IDs
 * @param {object} resource - { trail_links: [{ osm_type, osm_id }] }
 * @param {object} trailProps - { osm_way_ids?, osmIds?, osm_relation_id?, osmId? }
 */
export function resourceMatchesTrail(resource, trailProps) {
  const links = resource.trail_links || [];
  if (links.length === 0) return false;

  let rawWayIds = trailProps.osm_way_ids ?? trailProps.osmIds;
  if (typeof rawWayIds === 'string') {
    try {
      rawWayIds = JSON.parse(rawWayIds);
    } catch {
      rawWayIds = null;
    }
  }
  const wayIdList = Array.isArray(rawWayIds) ? rawWayIds : rawWayIds != null ? [rawWayIds] : [];
  const wayIds = new Set(wayIdList.map((id) => Number(id)).filter((n) => !Number.isNaN(n)));
  const relationId =
    (trailProps.osm_relation_id ?? trailProps.osmId) != null
      ? Number(trailProps.osm_relation_id ?? trailProps.osmId)
      : null;

  for (const link of links) {
    const linkOsmId = Number(link.osm_id);
    if (Number.isNaN(linkOsmId)) continue;
    const type = String(link.osm_type || '').toLowerCase();
    if (type === 'way' && wayIds.has(linkOsmId)) return true;
    if (type === 'relation' && relationId === linkOsmId) return true;
  }
  return false;
}

/**
 * Filter resources to those that apply to the given trail
 * @param {Array} resources - From API: [{ id, name, url, description, trail_links }]
 * @param {object} trailProps - Feature properties with osm_way_ids, osm_relation_id
 */
export function filterResourcesForTrail(resources, trailProps) {
  if (!resources?.length) return [];
  return resources.filter((r) => resourceMatchesTrail(r, trailProps));
}

/**
 * Check if any resource applies to this trail (for conditional button)
 */
export function hasResourcesForTrail(resources, trailProps) {
  return filterResourcesForTrail(resources, trailProps).length > 0;
}

/**
 * Slugify trail name for AllTrails URL path (lowercase, hyphens, alphanumeric).
 * AllTrails direct trail URLs use this format: /trail/us/{state}/{slug}
 */
function allTrailsSlug(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s*&\s*/g, '-and-')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * State name -> AllTrails URL segment (lowercase, e.g. "California" -> "california").
 */
function allTrailsStateSlug(stateName) {
  if (!stateName || typeof stateName !== 'string') return 'california';
  return stateName.toLowerCase().trim().replace(/\s+/g, '-');
}

/**
 * AllTrails URL for a trail. Prefers direct trail page when we can build a slug;
 * otherwise falls back to state trails list (no redirect to explore map).
 * Note: /search?q=... redirects to /explore with bounding box and is not useful.
 *
 * @param {string} trailName - Name of the trail
 * @param {string} [stateName] - State name (e.g. "California")
 * @returns {string} AllTrails URL (direct trail or state list)
 */
export function getAllTrailsUrl(trailName, stateName = 'California') {
  const stateSlug = allTrailsStateSlug(stateName);
  const trailSlug = allTrailsSlug(trailName);
  if (trailSlug) {
    return `https://www.alltrails.com/trail/us/${stateSlug}/${trailSlug}`;
  }
  return `https://www.alltrails.com/us/${stateSlug}`;
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
