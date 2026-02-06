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
    // 1. Check cache (skip if table doesn't exist yet)
    let cacheHit = false;
    let cachedUrl = null;
    try {
      const { data: row, error: selectError } = await supabase
        .from('alltrails_lookups')
        .select('url')
        .eq('state', state)
        .eq('trail_name', trailName)
        .maybeSingle();

      if (!selectError && row !== null) {
        cacheHit = true;
        cachedUrl = row.url;
      }
    } catch {
      // Table may not exist; fall through to SerpAPI
    }

    if (cacheHit) {
      res.setHeader('Cache-Control', 's-maxage=604800'); // 7 days
      return res.status(200).json({ url: cachedUrl });
    }

    // 2. Cache miss - call SerpAPI
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return res.status(200).json({ url: null });
    }

    const stateName = STATES[state]?.name || state;
    const query = `${trailName} alltrails ${stateName}`;
    const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&location=${encodeURIComponent(stateName + ', United States')}&api_key=${apiKey}`;

    console.log('[AllTrails] SerpAPI request:', { trailName, state, query, location: stateName + ', United States' });

    const serpRes = await fetch(serpUrl);
    if (!serpRes.ok) {
      const errText = await serpRes.text();
      console.error('[AllTrails] SerpAPI HTTP error:', serpRes.status, errText?.slice(0, 500));
      return res.status(200).json({ url: null });
    }

    const serp = await serpRes.json();
    const organic = serp?.organic_results || [];
    const allLinks = organic.map((o) => o?.link || o?.displayed_link).filter(Boolean);
    console.log('[AllTrails] SerpAPI response:', {
      organicCount: organic.length,
      links: allLinks.slice(0, 10),
      firstItemKeys: organic[0] ? Object.keys(organic[0]) : [],
    });

    let url = null;
    for (const item of organic) {
      const link = item.link || '';
      if (typeof link === 'string' && ALLTRAILS_TRAIL_PATTERN.test(link)) {
        url = link;
        break;
      }
    }
    if (!url) {
      console.log('[AllTrails] No alltrails.com/trail/ link found in organic results. Pattern:', ALLTRAILS_TRAIL_PATTERN.toString());
    } else {
      console.log('[AllTrails] Found trail URL:', url);
    }

    // 3. Store result if table exists (ignore upsert errors)
    const { error: upsertError } = await supabase.from('alltrails_lookups').upsert(
      {
        state,
        trail_name: trailName,
        url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'state,trail_name' }
    );
    if (upsertError) console.warn('alltrails_lookups upsert failed:', upsertError.message);

    res.setHeader('Cache-Control', 's-maxage=604800'); // 7 days
    return res.status(200).json({ url });
  } catch (err) {
    console.error('AllTrails lookup error:', err);
    return res.status(500).json({ error: err.message });
  }
}
