/**
 * Frontend API client - fetches trails and observations from our Vercel API
 */

const getBaseUrl = () => {
  if (import.meta.env.DEV) {
    return ''; // Vite proxy or same origin in dev
  }
  return import.meta.env.VITE_API_BASE_URL || '';
};

export async function fetchTrails(state) {
  const res = await fetch(`${getBaseUrl()}/api/trails/${state}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Trails fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchObservations(state) {
  const res = await fetch(`${getBaseUrl()}/api/observations?state=${state}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Observations fetch failed: ${res.status}`);
  }
  return res.json();
}
