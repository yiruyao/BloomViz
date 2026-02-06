import { supabase } from '../lib/supabase.js';

const VALID_STATES = ['ca', 'or', 'wa'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const state = req.query.state?.toLowerCase();
  if (!state || !VALID_STATES.includes(state)) {
    return res.status(400).json({ error: 'Invalid state. Use ca, or, or wa.' });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().split('T')[0];

  const PAGE_SIZE = 500;
  const allData = [];
  let offset = 0;

  try {
    while (true) {
      const { data, error } = await supabase
        .from('observations')
        .select('id, species, scientific_name, observed_on, quality_grade, user_login, photo_url, geojson')
        .eq('state', state)
        .gte('observed_on', dateStr)
        .order('observed_on', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data?.length) break;
      allData.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const geojson = {
      type: 'FeatureCollection',
      features: (allData || []).map((obs) => ({
        type: 'Feature',
        properties: {
          id: obs.id,
          species: obs.species,
          scientificName: obs.scientific_name,
          observedOn: obs.observed_on,
          qualityGrade: obs.quality_grade,
          userId: obs.user_login,
          photoUrl: obs.photo_url,
        },
        geometry: obs.geojson,
      })),
    };

    res.setHeader('Cache-Control', 's-maxage=3600'); // 1h
    return res.status(200).json(geojson);
  } catch (err) {
    console.error('Observations API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
