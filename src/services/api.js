/**
 * Frontend API client - fetches trails and observations from our Vercel API.
 * Responses are cached in memory by state to avoid refetching when switching states.
 */

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return ''; // Vite dev: same origin
  }
  // Production: same origin so /api/* hits the same Vercel deployment
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

function apiUrl(path) {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

const DEFAULT_FETCH_TIMEOUT_MS = 60000; // 60s
const TRAILS_FETCH_TIMEOUT_MS = 120000; // 2 min – trails API does many paginated DB requests

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId)
  );
}

async function parseJsonResponse(res) {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || trimmed.startsWith('import ')) {
    throw new Error(
      'API returned non-JSON (HTML or JS). In local dev, /api routes are not available. ' +
      'Use "vercel dev" to run API + app, or set VITE_API_BASE_URL to your deployed app URL in .env.local.'
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      'API returned invalid JSON. In local dev, use "vercel dev" or set VITE_API_BASE_URL to your deployed app URL in .env.local.'
    );
  }
}

// In-memory cache: state -> parsed response (persists for session)
const trailsCache = new Map();
const observationsCache = new Map();
const trailCountsCache = new Map();

export async function fetchTrails(state) {
  const key = state.toLowerCase();
  if (trailsCache.has(key)) {
    return trailsCache.get(key);
  }
  const res = await fetchWithTimeout(apiUrl(`/api/trails/${state}`), {}, TRAILS_FETCH_TIMEOUT_MS);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Trails fetch failed: ${res.status}`);
  }
  const data = await parseJsonResponse(res);
  trailsCache.set(key, data);
  return data;
}

export async function fetchObservations(state) {
  const key = state.toLowerCase();
  if (observationsCache.has(key)) {
    return observationsCache.get(key);
  }
  const res = await fetchWithTimeout(apiUrl(`/api/observations?state=${state}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Observations fetch failed: ${res.status}`);
  }
  const data = await parseJsonResponse(res);
  observationsCache.set(key, data);
  return data;
}

/**
 * Look up AllTrails direct trail URL. Returns { url } or { url: null }.
 * Uses cached DB results; only calls SerpAPI for first-time lookups.
 */
export async function fetchAllTrailsLookup(trailName, state) {
  try {
    const res = await fetchWithTimeout(
      apiUrl(`/api/alltrails-lookup?trailName=${encodeURIComponent(trailName)}&state=${encodeURIComponent(state)}`)
    );
    if (!res.ok) return { url: null };
    const data = await parseJsonResponse(res);
    return data;
  } catch {
    return { url: null };
  }
}

/**
 * Pre-built trail → observation counts (from trail_observation_counts table).
 * Returns null if the table is empty or not yet populated.
 * Used for Map view (full dataset for styling all trails).
 */
export async function fetchTrailCounts(state) {
  const key = state.toLowerCase();
  if (trailCountsCache.has(key)) {
    return trailCountsCache.get(key);
  }
  const res = await fetch(apiUrl(`/api/trail-counts?state=${state}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Trail counts fetch failed: ${res.status}`);
  }
  const data = await parseJsonResponse(res);
  trailCountsCache.set(key, data);
  return data;
}

const trailListCache = new Map();

/**
 * Optimized payload for Trail List view only: top 10 trails and top 10 species.
 * Use this for the list tab instead of full trail-counts.
 */
export async function fetchTrailList(state) {
  const key = state.toLowerCase();
  if (trailListCache.has(key)) {
    return trailListCache.get(key);
  }
  const res = await fetchWithTimeout(apiUrl(`/api/trail-list?state=${state}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Trail list fetch failed: ${res.status}`);
  }
  const data = await parseJsonResponse(res);
  trailListCache.set(key, data);
  return data;
}
