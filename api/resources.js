import { supabase } from '../lib/supabase.js';

/**
 * GET /api/resources
 * Returns resource_links with their trail links (osm_type, osm_id) for frontend filtering.
 * Format: [{ id, name, url, description, trail_links: [{ osm_type, osm_id }] }]
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data: resources, error: resourcesError } = await supabase
      .from('resource_links')
      .select('id, name, url, description');

    if (resourcesError) throw resourcesError;

    const { data: trailLinks, error: linksError } = await supabase
      .from('resource_trail_links')
      .select('resource_id, osm_type, osm_id');

    if (linksError) throw linksError;

    const linksByResource = new Map();
    for (const row of trailLinks || []) {
      if (!linksByResource.has(row.resource_id)) {
        linksByResource.set(row.resource_id, []);
      }
      linksByResource.get(row.resource_id).push({
        osm_type: row.osm_type,
        osm_id: row.osm_id,
      });
    }

    const result = (resources || []).map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      description: r.description,
      trail_links: linksByResource.get(r.id) || [],
    }));

    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Resources API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
