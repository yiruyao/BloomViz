-- Resource links and trail links for Resources & Reports
-- Resources link to specific trail OSM IDs (way/relation), not area placements

CREATE TABLE IF NOT EXISTS resource_links (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS resource_trail_links (
  resource_id INT NOT NULL REFERENCES resource_links(id) ON DELETE CASCADE,
  osm_type VARCHAR(10) NOT NULL CHECK (osm_type IN ('way', 'relation')),
  osm_id BIGINT NOT NULL,
  PRIMARY KEY (resource_id, osm_type, osm_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_trail_links_osm
  ON resource_trail_links(osm_type, osm_id);

-- Seed Midpen and SMC Parks resources (trail links populated by backfill script)
INSERT INTO resource_links (id, name, url, description) VALUES
  (1, 'Midpen Wildflower Guide', 'https://www.openspace.org/where-to-go/nature/wildflowers', 'Midpeninsula Regional Open Space District'),
  (2, 'SMC Parks Spring Flowers', 'https://www.smcgov.org/parks/news/enjoy-wildflowers-san-mateo-county-park-spring', 'San Mateo County Parks Department')
ON CONFLICT (id) DO NOTHING;
