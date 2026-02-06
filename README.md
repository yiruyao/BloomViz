# BloomScout

Wildflower trail finder for California, Oregon, and Washington. Trail data is read from Supabase (OpenStreetMap-backed); iNaturalist observations use a 7-day window. Spatial analysis and Mapbox for the map.

## Setup

1. **Supabase**: Create a project, run `supabase/schema.sql` in the SQL Editor.
2. **Env**: Copy `.env.example` to `.env.local`. Set `VITE_MAPBOX_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. For cron, set `CRON_SECRET` (e.g. `openssl rand -hex 32`).
3. **Trails**: Backfill trails once from Overpass into Supabase: `node scripts/generate-trails.js`. At runtime the app only reads from the `trails` table (no Overpass calls).
4. **Cron**: Deploy to Vercel; cron runs daily at 6 AM UTC to refresh observations. To backfill observations immediately, call `GET /api/cron/refresh-observations` with `Authorization: Bearer <CRON_SECRET>`.

## Run locally

- **Full stack** (frontend + API): `vercel dev`
- **Frontend only**: `npm run dev` (API calls will 404 unless you set `VITE_API_BASE_URL` to your deployed API).

## React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
