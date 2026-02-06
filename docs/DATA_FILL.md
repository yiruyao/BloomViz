# Filling Supabase data (observations + trails)

## Prerequisites

1. **Create tables** – In [Supabase](https://supabase.com/dashboard) → your project → **SQL Editor**, run the contents of `supabase/schema.sql` (creates `trails` and `observations`).
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

If you see *"Could not query the database for the schema cache"*, check: project not paused, correct URL and service key in env, and that the schema has been run in SQL Editor.
