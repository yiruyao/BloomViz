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

  const PAGE_SIZE = 300;
  const allData = [];
  let offset = 0;

  try {
    while (true) {
      const { data, error } = await supabase
        .from('trail_observation_counts')
        .select('trail_name, observation_count, species_breakdown')
        .eq('state', state)
        .order('observation_count', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data?.length) break;
      allData.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const counts = (allData || []).map((row) => ({
      trail_name: row.trail_name,
      observation_count: row.observation_count,
      species_breakdown: row.species_breakdown || [],
    }));

    res.setHeader('Cache-Control', 's-maxage=86400'); // 24h
    return res.status(200).json(counts);
  } catch (err) {
    console.error('Trail counts API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
