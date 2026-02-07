-- Add taxon_id to observations for iNaturalist species links
-- Run in Supabase SQL Editor: migrations/001_add_taxon_id.sql
ALTER TABLE observations ADD COLUMN IF NOT EXISTS taxon_id INTEGER;
