import { supabase } from '../../lib/supabase.js';
import { STATES } from '../../src/config/states.js';

const INATURALIST_API_URL = 'https://api.inaturalist.org/v1/observations';

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function fetchObservationsForPlace(placeId, d1, d2) {
  const all = [];
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const params = new URLSearchParams({
      place_id: placeId,
      quality_grade: 'research,needs_id',
      term_id: 12,
      term_value_id: 13,
      d1,
      d2,
      per_page: 200,
      geo: true,
      order_by: 'observed_on',
      page,
    });

    const res = await fetch(`${INATURALIST_API_URL}?${params}`);
    if (!res.ok) throw new Error(`iNaturalist error: ${res.status}`);
    const data = await res.json();

    if (!data.results?.length) break;
    all.push(...data.results);
    if (data.results.length < 200) break;
    page++;
  }

  return all;
}

export default async function handler(req, res) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const d1 = formatDate(sevenDaysAgo);
  const d2 = formatDate(new Date());

  const results = { states: {}, error: null };

  for (const [stateCode, config] of Object.entries(STATES)) {
    try {
      const observations = await fetchObservationsForPlace(config.iNaturalistPlaceId, d1, d2);

      await supabase
        .from('observations')
        .delete()
        .lt('observed_on', d1)
        .eq('state', stateCode);

      const rows = observations
        .filter((obs) => obs.geojson?.coordinates)
        .map((obs) => ({
          id: obs.id,
          state: stateCode,
          species: obs.taxon?.preferred_common_name || obs.taxon?.name || null,
          scientific_name: obs.taxon?.name || null,
          observed_on: obs.observed_on || null,
          quality_grade: obs.quality_grade || null,
          user_login: obs.user?.login || null,
          photo_url: obs.photos?.[0]?.url?.replace('square', 'small') || null,
          longitude: obs.geojson?.coordinates?.[0] ?? null,
          latitude: obs.geojson?.coordinates?.[1] ?? null,
          geojson: obs.geojson || null,
        }));

      if (rows.length > 0) {
        const { error: upsertError } = await supabase.from('observations').upsert(rows, {
          onConflict: 'id,state',
        });
        if (upsertError) throw upsertError;
      }

      results.states[stateCode] = { count: rows.length };
    } catch (err) {
      console.error(`refresh-observations ${stateCode}:`, err);
      results.error = results.error || err.message;
      results.states[stateCode] = { error: err.message };
    }
  }

  return res.status(results.error ? 207 : 200).json(results);
}
