import { supabase } from '../lib/supabase.js';

/**
 * GET /api/resources-for-trail?osm_way_ids=1,2,3&osm_relation_id=4
 * Returns only resources linked to the given trail OSM IDs.
 * Queries resource_trail_links first, then fetches resource_links for matching ids.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const osmWayIds = (req.query.osm_way_ids || '')
    .split(',')
    .map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
  const osmRelationId =
    req.query.osm_relation_id != null && req.query.osm_relation_id !== ''
      ? parseInt(req.query.osm_relation_id, 10)
      : null;

  if (osmWayIds.length === 0 && (osmRelationId == null || Number.isNaN(osmRelationId))) {
    return res.status(200).json([]);
  }

  try {
    const resourceIds = new Set();

    if (osmWayIds.length > 0) {
      const { data: wayLinks } = await supabase
        .from('resource_trail_links')
        .select('resource_id')
        .eq('osm_type', 'way')
        .in('osm_id', osmWayIds);
      (wayLinks || []).forEach((r) => resourceIds.add(r.resource_id));
    }

    if (osmRelationId != null && !Number.isNaN(osmRelationId)) {
      const { data: relationLinks } = await supabase
        .from('resource_trail_links')
        .select('resource_id')
        .eq('osm_type', 'relation')
        .eq('osm_id', osmRelationId);
      (relationLinks || []).forEach((r) => resourceIds.add(r.resource_id));
    }

    if (resourceIds.size === 0) {
      return res.status(200).json([]);
    }

    const { data: resources, error } = await supabase
      .from('resource_links')
      .select('id, name, url, description')
      .in('id', [...resourceIds]);

    if (error) throw error;

    res.setHeader('Cache-Control', 's-maxage=3600');
    return res.status(200).json(resources || []);
  } catch (err) {
    console.error('Resources-for-trail API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
