export default async function handler(req, res) {
  console.log('ping: invoked');
  return res.status(200).json({ ok: true, ts: new Date().toISOString() });
}
