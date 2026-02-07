# Filling Supabase data (observations + trails)

## Prerequisites

1. **Create tables** – In [Supabase](https://supabase.com/dashboard) → your project → **SQL Editor**, run the contents of `supabase/schema.sql` (creates `trails`, `observations`, and `trail_observation_counts`). If you have an existing `observations` table without `taxon_id`, run `supabase/migrations/001_add_taxon_id.sql` to add it for species links.
2. **Project running** – If the project is paused, use **Restore project** in the dashboard.
3. **Env** – In project root, `.env` or `.env.local` must have:
   - `SUPABASE_URL` (e.g. `https://xxxx.supabase.co`)
   - `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` (project Settings → API → service_role key)

## Commands (from project root)

**Observations (iNaturalist, last 7 days):**
```bash
npm run fill-observations
# or: node scripts/backfill-observations.js --days=7
```

**Trails (Overpass, CA + OR + WA; can take several minutes per state):**
```bash
npm run fill-trails
# or: node scripts/generate-trails.js
```

**Trail → observation counts (precomputed; run after observations/trails are filled):**
```bash
node scripts/refresh-trail-counts.js
# or one state: node scripts/refresh-trail-counts.js --state=ca
```
This fills `trail_observation_counts` so the app can skip client-side spatial analysis and load faster. Run again whenever observations are refreshed (e.g. after cron or backfill).

If you see *"Could not query the database for the schema cache"*, check: project not paused, correct URL and service key in env, and that the schema has been run in SQL Editor.

If the app shows *"canceling statement due to statement timeout"* when loading trails, Supabase’s default timeout may be too low. In **Supabase Dashboard → Project Settings → Database**, you can increase the statement timeout, or run in SQL Editor: `ALTER DATABASE postgres SET statement_timeout = '30s';` (then reconnect).
