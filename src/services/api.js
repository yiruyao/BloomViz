/**
 * Frontend API client - fetches trails and observations from our Vercel API.
 * Responses are cached in memory by state to avoid refetching when switching states.
 */

const getBaseUrl = () => {
  if (import.meta.env.DEV) {
    return ''; // Vite proxy or same origin in dev
  }
  return import.meta.env.VITE_API_BASE_URL || '';
};

// In-memory cache: state -> parsed response (persists for session)
const trailsCache = new Map();
const observationsCache = new Map();
const trailCountsCache = new Map();

export async function fetchTrails(state) {
  const key = state.toLowerCase();
  if (trailsCache.has(key)) {
    return trailsCache.get(key);
  }
  const res = await fetch(`${getBaseUrl()}/api/trails/${state}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Trails fetch failed: ${res.status}`);
  }
  const data = await res.json();
  trailsCache.set(key, data);
  return data;
}

export async function fetchObservations(state) {
  const key = state.toLowerCase();
  if (observationsCache.has(key)) {
    return observationsCache.get(key);
  }
  const res = await fetch(`${getBaseUrl()}/api/observations?state=${state}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Observations fetch failed: ${res.status}`);
  }
  const data = await res.json();
  observationsCache.set(key, data);
  return data;
}

/**
 * Pre-built trail → observation counts (from trail_observation_counts table).
 * Returns null if the table is empty or not yet populated.
 */
export async function fetchTrailCounts(state) {
  const key = state.toLowerCase();
  if (trailCountsCache.has(key)) {
    return trailCountsCache.get(key);
  }
  const res = await fetch(`${getBaseUrl()}/api/trail-counts?state=${state}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Trail counts fetch failed: ${res.status}`);
  }
  const data = await res.json();
  trailCountsCache.set(key, data);
  return data;
}
