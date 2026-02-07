-- Run this in Supabase SQL Editor to create tables for BloomScout

-- Trails: one row per (state, chunk_id) so backfill can write in small chunks and avoid DB overload.
-- If you already have the old single-row-per-state table, run this migration first:
--   ALTER TABLE trails ADD COLUMN IF NOT EXISTS chunk_id INT NOT NULL DEFAULT 0;
--   ALTER TABLE trails DROP CONSTRAINT IF EXISTS trails_pkey;
--   ALTER TABLE trails ADD PRIMARY KEY (state, chunk_id);
-- Then re-run the backfill (generate-trails.js) to populate chunked rows.
CREATE TABLE IF NOT EXISTS trails (
  state VARCHAR(2) NOT NULL,
  chunk_id INT NOT NULL DEFAULT 0,
  geojson JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (state, chunk_id)
);

-- Observations: one row per observation, 7-day rolling window per state
CREATE TABLE IF NOT EXISTS observations (
  id BIGINT NOT NULL,
  state VARCHAR(2) NOT NULL,
  species VARCHAR(255),
  scientific_name VARCHAR(255),
  observed_on DATE,
  quality_grade VARCHAR(50),
  user_login VARCHAR(100),
  photo_url TEXT,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  geojson JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, state)
);

CREATE INDEX IF NOT EXISTS idx_observations_state_date
  ON observations(state, observed_on DESC);

-- Pre-computed trail → observation counts (refreshed by script/cron; avoids client-side spatial analysis)
CREATE TABLE IF NOT EXISTS trail_observation_counts (
  state VARCHAR(2) NOT NULL,
  trail_name TEXT NOT NULL,
  observation_count INT NOT NULL DEFAULT 0,
  species_breakdown JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (state, trail_name)
);

CREATE INDEX IF NOT EXISTS idx_trail_observation_counts_state
  ON trail_observation_counts(state);

-- Optimizes /api/trail-list top-10 query: ORDER BY observation_count DESC LIMIT 10
CREATE INDEX IF NOT EXISTS idx_trail_observation_counts_state_count
  ON trail_observation_counts(state, observation_count DESC);

-- AllTrails URL lookups: cache trail name → AllTrails direct link (avoids repeated SerpAPI searches)
CREATE TABLE IF NOT EXISTS alltrails_lookups (
  state VARCHAR(2) NOT NULL,
  trail_name TEXT NOT NULL,
  url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (state, trail_name)
);

CREATE INDEX IF NOT EXISTS idx_alltrails_lookups_state
  ON alltrails_lookups(state);
