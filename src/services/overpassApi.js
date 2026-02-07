/**
 * Overpass API service for fetching OpenStreetMap trail data
 * Endpoint: https://overpass-api.de/api/interpreter (no auth required)
 */

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Run an Overpass API query
 */
async function runOverpassQuery(query) {
  const response = await fetch(OVERPASS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch hiking trails for a US state from OpenStreetMap
 * @param {string} stateName - Full state name: "California", "Oregon", "Washington"
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function fetchTrailsForState(stateName) {
  const query = `
[out:json][timeout:300];
area["name"="${stateName}"]["admin_level"="4"]->.state;
(
  way["highway"~"path|footway|track"]["name"](area.state);
  relation["route"="hiking"](area.state);
);
out body geom;
`;

  const data = await runOverpassQuery(query);
  return convertToGeoJSON(data.elements);
}

/**
 * Fetch hiking trails in San Mateo County from OpenStreetMap
 * Returns trails as GeoJSON features with osm_way_ids and osm_relation_id.
 * Used by backfill script to populate resource_trail_links.
 */
export async function fetchSanMateoTrails() {
  const query = `
[out:json][timeout:60];
area["name"="San Mateo County"]["admin_level"="6"]->.county;
(
  way["highway"~"path|footway|track"]["name"](area.county);
  relation["route"="hiking"](area.county);
);
out body geom;
`;

  const data = await runOverpassQuery(query);
  return convertToGeoJSON(data.elements);
}

/**
 * Convert OSM elements to GeoJSON features
 * Groups way fragments by name tag
 */
function convertToGeoJSON(elements) {
  const trailsByName = new Map();

  for (const element of elements) {
    if (element.type === 'way' && element.geometry && element.tags?.name) {
      const name = element.tags.name;

      if (!trailsByName.has(name)) {
        trailsByName.set(name, {
          type: 'Feature',
          properties: {
            name: name,
            highway: element.tags.highway,
            osm_way_ids: [],
            osm_relation_id: null,
          },
          geometry: {
            type: 'MultiLineString',
            coordinates: [],
          },
        });
      }

      const trail = trailsByName.get(name);
      trail.properties.osm_way_ids.push(element.id);

      const coords = element.geometry.map((point) => [point.lon, point.lat]);
      trail.geometry.coordinates.push(coords);
    }

    if (element.type === 'relation' && element.tags?.name && element.members) {
      const name = element.tags.name;

      if (!trailsByName.has(name)) {
        const coordinates = [];
        for (const member of element.members) {
          if (member.type === 'way' && member.geometry) {
            const coords = member.geometry.map((point) => [point.lon, point.lat]);
            coordinates.push(coords);
          }
        }

        if (coordinates.length > 0) {
          trailsByName.set(name, {
            type: 'Feature',
            properties: {
              name: name,
              highway: element.tags.highway,
              route: element.tags.route,
              osm_way_ids: [],
              osm_relation_id: element.id,
            },
            geometry: {
              type: 'MultiLineString',
              coordinates: coordinates,
            },
          });
        }
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: Array.from(trailsByName.values()),
  };
}
