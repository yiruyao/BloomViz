import { supabase } from '../../lib/supabase.js';

const VALID_STATES = ['ca', 'or', 'wa'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { state } = req.query;
  const stateLower = state?.toLowerCase();

  if (!stateLower || !VALID_STATES.includes(stateLower)) {
    return res.status(400).json({ error: 'Invalid state. Use ca, or, or wa.' });
  }

  const PAGE_SIZE = 10; // avoid Supabase statement timeout (fetch in small batches)
  const allRows = [];
  let offset = 0;

  try {
    while (true) {
      const { data: rows, error } = await supabase
        .from('trails')
        .select('geojson')
        .eq('state', stateLower)
        .order('chunk_id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!rows?.length) break;
      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (!allRows.length) {
      return res.status(404).json({ error: 'Trails not found for this state. Run generate-trails script first.' });
    }

    const features = allRows.flatMap((r) => r.geojson?.features ?? []);
    const geojson = { type: 'FeatureCollection', features };

    res.setHeader('Cache-Control', 's-maxage=86400'); // 24h
    return res.status(200).json(geojson);
  } catch (err) {
    console.error('Trails API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
