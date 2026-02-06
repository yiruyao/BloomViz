/**
 * Backfill observations from iNaturalist into Supabase (upsert-only, no delete).
 * Run from project root. Load .env / .env.local for SUPABASE_URL and SUPABASE_SERVICE_KEY.
 *
 * Usage:
 *   node scripts/backfill-observations.js [--days=30] [--state=ca|or|wa]
 *
 * Examples:
 *   node scripts/backfill-observations.js              # last 30 days, all states
 *   node scripts/backfill-observations.js --days=7     # last 7 days
 *   node scripts/backfill-observations.js --state=ca    # California only, 30 days
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const { backfillOneState } = await import('../api/cron/refresh-observations.js');

const STATES = ['ca', 'or', 'wa'];

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function parseArgs() {
  const args = process.argv.slice(2);
  let days = 30;
  let state = null;
  for (const arg of args) {
    if (arg.startsWith('--days=')) days = parseInt(arg.slice(7), 10) || 30;
    else if (arg.startsWith('--state=')) state = arg.slice(8).toLowerCase();
  }
  return { days, state };
}

function getChunks(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const chunks = [];
  let d1 = new Date(start);
  while (d1 < end) {
    const d2 = new Date(d1);
    d2.setDate(d2.getDate() + 6);
    if (d2 > end) d2.setTime(end.getTime());
    chunks.push({ d1: formatDate(d1), d2: formatDate(d2) });
    d1.setDate(d1.getDate() + 7);
  }
  return chunks;
}

async function main() {
  const { days, state } = parseArgs();
  const states = state ? [state] : STATES;
  if (state && !STATES.includes(state)) {
    console.error(`Invalid --state=${state}. Use ca, or, or wa.`);
    process.exit(1);
  }

  const chunks = getChunks(days);
  console.log(`Backfilling ${states.join(', ')} for last ${days} days (${chunks.length} week chunk(s))…`);

  let total = 0;
  for (const stateCode of states) {
    for (const { d1, d2 } of chunks) {
      try {
        const result = await backfillOneState(stateCode, d1, d2);
        total += result.count;
        if (result.count > 0) {
          console.log(`  ${stateCode} ${d1}..${d2}: ${result.count} observations`);
        }
      } catch (err) {
        console.error(`  ${stateCode} ${d1}..${d2}:`, err.message);
      }
    }
  }

  console.log(`Done. Total observations upserted: ${total}`);
}

main();
