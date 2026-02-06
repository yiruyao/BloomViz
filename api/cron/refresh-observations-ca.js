import { refreshOneState } from './refresh-observations.js';

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

export default async function handler(req, res) {
  console.log('refresh-observations-ca: handler started');
  const authHeader = (req.headers && (req.headers.authorization || req.headers['authorization'])) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const d1 = formatDate(sevenDaysAgo);
  const d2 = formatDate(new Date());

  try {
    const result = await refreshOneState('ca', d1, d2);
    return res.status(200).json({ state: 'ca', ...result });
  } catch (err) {
    console.error('refresh-observations-ca:', err);
    return res.status(500).json({ error: err.message });
  }
}
