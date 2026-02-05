/**
 * iNaturalist API service for fetching flowering plant observations
 * Endpoint: https://api.inaturalist.org/v1/observations (no auth required for read)
 */

const INATURALIST_API_URL = 'https://api.inaturalist.org/v1/observations';

// San Mateo County place_id
const SAN_MATEO_COUNTY_PLACE_ID = 1919;

// Taxon IDs for showy wildflowers
const TAXON_IDS = {
  CALIFORNIA_POPPY: 47125,
  LUPINE: 53086,
  GOLDFIELDS: 54779,
};

/**
 * Get date string in YYYY-MM-DD format
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get date from N days ago
 */
function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Fetch flowering wildflower observations from San Mateo County
 * Filters: last 2 weeks, research/needs_id grade, flowering phenology
 */
export async function fetchFloweringObservations() {
  const twoWeeksAgo = formatDate(getDaysAgo(14));
  const today = formatDate(new Date());

  const params = new URLSearchParams({
    place_id: SAN_MATEO_COUNTY_PLACE_ID,
    quality_grade: 'research,needs_id',
    term_id: 12,          // Plant Phenology
    term_value_id: 13,    // Flowering
    taxon_id: Object.values(TAXON_IDS).join(','),
    d1: twoWeeksAgo,
    d2: today,
    per_page: 200,
    geo: true,
    order_by: 'observed_on',
  });

  const allObservations = [];
  let page = 1;
  let hasMore = true;

  // Paginate through results (in case there are >200 observations)
  while (hasMore) {
    params.set('page', page);
    
    const response = await fetch(`${INATURALIST_API_URL}?${params}`);
    
    if (!response.ok) {
      throw new Error(`iNaturalist API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      allObservations.push(...data.results);
      
      // Check if there are more pages
      if (data.results.length < 200) {
        hasMore = false;
      } else {
        page++;
        // Safety limit to avoid infinite loops
        if (page > 10) {
          console.warn('Reached pagination limit (10 pages)');
          hasMore = false;
        }
      }
    } else {
      hasMore = false;
    }
  }

  return convertToGeoJSON(allObservations);
}

/**
 * Convert iNaturalist observations to GeoJSON points
 */
function convertToGeoJSON(observations) {
  const features = observations
    .filter(obs => obs.geojson && obs.geojson.coordinates)
    .map(obs => ({
      type: 'Feature',
      properties: {
        id: obs.id,
        species: obs.taxon?.preferred_common_name || obs.taxon?.name || 'Unknown',
        scientificName: obs.taxon?.name,
        observedOn: obs.observed_on,
        qualityGrade: obs.quality_grade,
        userId: obs.user?.login,
        photoUrl: obs.photos?.[0]?.url?.replace('square', 'small'),
      },
      geometry: obs.geojson,
    }));

  return {
    type: 'FeatureCollection',
    features: features,
  };
}

/**
 * Get the taxon IDs being used
 */
export function getTaxonIds() {
  return TAXON_IDS;
}
