import { supabase } from '../lib/supabase.js';
import { STATES } from './lib/states.js';

const VALID_STATES = ['ca', 'or', 'wa'];
const ALLTRAILS_TRAIL_PATTERN = /alltrails\.com\/trail\//;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const trailName = req.query.trailName?.trim();
  const state = req.query.state?.toLowerCase();

  if (!trailName) {
    return res.status(400).json({ error: 'Missing trailName' });
  }
  if (!state || !VALID_STATES.includes(state)) {
    return res.status(400).json({ error: 'Invalid state. Use ca, or, or wa.' });
  }

  try {
    // 1. Check cache
    const { data: row, error: selectError } = await supabase
      .from('alltrails_lookups')
      .select('url')
      .eq('state', state)
      .eq('trail_name', trailName)
      .maybeSingle();

    if (selectError) throw selectError;

    if (row !== null) {
      // Cache hit - return stored result (url may be null for previous failed lookups)
      res.setHeader('Cache-Control', 's-maxage=604800'); // 7 days
      return res.status(200).json({ url: row.url });
    }

    // 2. Cache miss - call SerpAPI
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return res.status(200).json({ url: null });
    }

    const stateName = STATES[state]?.name || state;
    const query = `${trailName} alltrails ${stateName}`;
    const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}`;

    const serpRes = await fetch(serpUrl);
    if (!serpRes.ok) {
      console.error('SerpAPI error:', serpRes.status, await serpRes.text());
      return res.status(200).json({ url: null });
    }

    const serp = await serpRes.json();
    const organic = serp?.organic_results || [];
    let url = null;

    for (const item of organic) {
      const link = item.link || '';
      if (ALLTRAILS_TRAIL_PATTERN.test(link)) {
        url = link;
        break;
      }
    }

    // 3. Store result (url or null) so we don't search again
    await supabase.from('alltrails_lookups').upsert(
      {
        state,
        trail_name: trailName,
        url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'state,trail_name' }
    );

    res.setHeader('Cache-Control', 's-maxage=604800'); // 7 days
    return res.status(200).json({ url });
  } catch (err) {
    console.error('AllTrails lookup error:', err);
    return res.status(500).json({ error: err.message });
  }
}
