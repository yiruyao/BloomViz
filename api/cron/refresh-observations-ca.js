import { refreshOneState } from './refresh-observations.js';

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

export default async function handler(req, res) {
  const authHeader = (req.headers && (req.headers.authorization || req.headers['authorization'])) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    console.warn('[refresh-observations-ca] Unauthorized: missing or invalid CRON_SECRET');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const d1 = formatDate(sevenDaysAgo);
  const d2 = formatDate(new Date());
  console.log('[refresh-observations-ca] Starting d1=%s d2=%s', d1, d2);

  try {
    const result = await refreshOneState('ca', d1, d2);
    console.log('[refresh-observations-ca] ok: count=%d', result.count);
    return res.status(200).json({ state: 'ca', ...result });
  } catch (err) {
    console.error('[refresh-observations-ca] failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
