import { primarySupabase } from '../supabase-config.mjs';
const SUPABASE_URL = primarySupabase.url;
const SUPABASE_KEY = primarySupabase.anonKey;

const JTE_API_BASE = 'https://ylvipapi.jtexpress.vn';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text), text }; } catch { return { ok: res.ok, status: res.status, data: null, text }; }
}

export default async function handler(req, res) {
  try {
    // Parse query string from req.url (Vite dev middleware provides raw req)
    const url = req.url || '';
    let waybillId;
    try {
      const parsed = new URL(url, 'http://localhost');
      waybillId = parsed.searchParams.get('waybillId');
    } catch (e) {
      // fallback: try simple regex
      const m = url && url.match(/waybillId=([^&]+)/);
      waybillId = m ? decodeURIComponent(m[1]) : null;
    }
    if (!waybillId) return res.status(400).json({ error: 'Missing waybillId' });

    // load jt_config
    const cfg = await fetchJson(`${SUPABASE_URL}/rest/v1/jt_config?select=auth_token,cookie&limit=1`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (!cfg.ok || !Array.isArray(cfg.data) || cfg.data.length === 0) {
      return res.status(500).json({ error: 'Unable to load J&T config from Supabase', detail: cfg.text });
    }
    const { auth_token: authToken, cookie } = cfg.data[0];
    if (!authToken || !cookie) return res.status(400).json({ error: 'Missing auth_token or cookie in jt_config' });

    const trackUrl = `${JTE_API_BASE}/api/track?waybillId=${encodeURIComponent(waybillId)}`;
    const trackResp = await fetch(trackUrl, { method: 'GET', headers: { Accept: 'application/json, text/plain, */*', authToken: authToken, langType: 'VN', routeName: 'OrderTable', cookie: cookie } });

    const text = await trackResp.text();
    try {
      const data = JSON.parse(text);
      return res.status(trackResp.ok ? 200 : 502).json({ ok: trackResp.ok, status: trackResp.status, data });
    } catch (e) {
      return res.status(502).json({ ok: false, status: trackResp.status, text });
    }
  } catch (err) {
    console.error('api/jt-track error', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
