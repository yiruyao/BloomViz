-- Run this in Supabase SQL Editor to create tables for BloomScout

-- Trails: one row per state, GeoJSON stored as JSONB
CREATE TABLE IF NOT EXISTS trails (
  state VARCHAR(2) PRIMARY KEY,
  geojson JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
