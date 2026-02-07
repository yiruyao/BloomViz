/**
 * Cron: refresh trail_observation_counts after daily observation refresh.
 * Schedule after observation crons (e.g. 6:10 UTC). Auth: Bearer CRON_SECRET.
 */

import { supabase } from '../../lib/supabase.js';
import { refreshOneState } from '../lib/refresh-trail-counts-lib.js';

const CRON_NAME = 'refresh-trail-counts';
const STATES = ['ca', 'or', 'wa'];

export default async function handler(req, res) {
  const authHeader = (req.headers && (req.headers.authorization || req.headers['authorization'])) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    console.warn(`[${CRON_NAME}] Unauthorized: missing or invalid CRON_SECRET`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log(`[${CRON_NAME}] Starting for states: ${STATES.join(', ')}`);
  const results = { states: {}, error: null };

  for (const state of STATES) {
    try {
      const result = await refreshOneState(supabase, state);
      results.states[state] = result;
      console.log(`[${CRON_NAME}] ${state} ok: trails=${result.trailsLoaded} obs=${result.observationsLoaded} rows=${result.rowsUpserted}`);
    } catch (err) {
      console.error(`[${CRON_NAME}] ${state} failed:`, err);
      results.error = results.error || err.message;
      results.states[state] = { error: err.message };
    }
  }

  const status = results.error ? 207 : 200;
  console.log(`[${CRON_NAME}] Finished with status ${status}`, results.error ? { error: results.error } : '');
  return res.status(status).json(results);
}
