import { primarySupabase } from '../supabase-config.mjs';
const SUPABASE_URL = primarySupabase.url;
const SUPABASE_KEY = primarySupabase.anonKey;

const JTE_API_BASE = 'https://ylvipapi.jtexpress.vn';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeJtText = (...parts) => {
  return parts
    .filter(Boolean)
    .join(' ')
    .toString()
    .trim()
    .toLowerCase();
};

const orderStatusMapping = (statusCode, statusName) => {
  const normalized = normalizeJtText(statusName);

  if (/ký nhận|giao hàng thành công|hoàn tất giao|đã giao|giao thành công|hoàn tất|đã nhận|ký nhận cpn/.test(normalized) || statusCode === 100) {
    return 3;
  }
  if (/chờ lấy hàng/.test(normalized)) {
    return 9;
  }
  if (/đã lấy hàng|lấy hàng|tiếp nhận|đã tiếp nhận/.test(normalized) || [10].includes(statusCode)) {
    return 10;
  }
  if (/đang vận chuyển|vận chuyển|đến bưu cục|gửi đi từ bưu cục|hàng đã đến bưu cục|hàng gửi đi từ bưu cục/.test(normalized) || [94].includes(statusCode)) {
    return 24;
  }
  if (/đang giao|giao hàng/.test(normalized) || [2].includes(statusCode)) {
    return 2;
  }
  return null;
};

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, options);
  const text = await res.text();


  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, status: res.status, data: null, text };
  }
};

const fetchJsonWithRetry = async (url, options = {}, retries = 2, delayMs = 1200) => {
  let result;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    result = await fetchJson(url, options);
    if (result.ok && result.data) {
      return result;
    }
    if (attempt < retries) {
      await sleep(delayMs);
    }
  }
  return result;
};

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const configResp = await fetchJson(`${SUPABASE_URL}/rest/v1/jt_config?select=auth_token,cookie&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!configResp.ok || !Array.isArray(configResp.data) || configResp.data.length === 0) {
      return res.status(500).json({ error: 'Unable to load J&T config from Supabase', detail: configResp.text });
    }

    const { auth_token: authToken, cookie } = configResp.data[0];
    if (!authToken || !cookie) {
      return res.status(400).json({ error: 'Missing J&T auth_token or cookie in jt_config' });
    }

    // Only fetch orders that have a J&T waybill and are in these active delivery statuses:
    // chờ lấy hàng (9), đã lấy hàng (10), đang vận chuyển (24), đang giao (2)
    const ordersResp = await fetchJson(`${SUPABASE_URL}/rest/v1/pancake_orders?select=id,jt_waybill_id,status,jt_status_code,jt_status_name&jt_waybill_id=not.is.null&status=in.(9,10,24,2)`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!ordersResp.ok) {
      return res.status(500).json({ error: 'Unable to load orders from Supabase', detail: ordersResp.text });
    }

    const orders = Array.isArray(ordersResp.data) ? ordersResp.data : [];
    const MAX_ORDERS_PER_SYNC = 20;
    const TRACK_REQUEST_DELAY_MS = 30000; // 30 seconds between each J&T track request
    const ordersToSync = orders.slice(0, MAX_ORDERS_PER_SYNC);
    console.log('JT Sync - orders found:', orders.length, 'will sync:', ordersToSync.map(o=>({id:o.id, waybill:o.jt_waybill_id, status:o.status})).slice(0,30));
    const syncResults = [];

    if (orders.length > ordersToSync.length) {
      syncResults.push({ info: `Sync limited to first ${ordersToSync.length} orders to avoid J&T rate limiting; ${orders.length - ordersToSync.length} orders skipped.` });
    }

    for (const order of ordersToSync) {
      const waybillId = String(order.jt_waybill_id || '').trim();
      if (!waybillId) continue;

      const trackUrl = `${JTE_API_BASE}/api/track?waybillId=${encodeURIComponent(waybillId)}`;
      await sleep(TRACK_REQUEST_DELAY_MS);
      const trackResp = await fetchJsonWithRetry(trackUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          authToken: authToken,
          langType: 'VN',
          routeName: 'OrderTable',
          cookie: cookie,
        },
      });

      if (!trackResp.ok || !trackResp.data || !Array.isArray(trackResp.data?.[0]?.details)) {
        syncResults.push({ orderId: order.id, waybillId, success: false, reason: 'track_failed', detail: trackResp.text });
        continue;
      }

      const details = trackResp.data[0].details;
      if (details.length === 0) {
        syncResults.push({ orderId: order.id, waybillId, success: true, updated: false, reason: 'no_tracking' });
        continue;
      }

      details.sort((a, b) => new Date(b.scanTime) - new Date(a.scanTime));
      const newest = details[0];
      const statusCode = newest.code || newest.scanType || newest.scanTypeCode || null;
      const statusName = newest.scanTypeName || newest.memo || newest.statusName || '';
      const mappedStatus = orderStatusMapping(statusCode, statusName);

      const updatePayload = {
        jt_status_code: statusCode,
        jt_status_name: statusName,
      };
      if (mappedStatus !== null) updatePayload.status = mappedStatus;

      const needsUpdate = order.jt_status_code !== statusCode || order.jt_status_name !== statusName || (mappedStatus !== null && order.status !== mappedStatus);
      if (!needsUpdate) {
        syncResults.push({ orderId: order.id, waybillId, success: true, updated: false });
        continue;
      }

      const patchResp = await fetchJson(`${SUPABASE_URL}/rest/v1/pancake_orders?id=eq.${order.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(updatePayload),
      });

      syncResults.push({
        orderId: order.id,
        waybillId,
        success: patchResp.ok,
        updated: patchResp.ok,
        payload: updatePayload,
        newest: { code: statusCode, name: statusName, mappedStatus },
        detail: patchResp.ok ? null : patchResp.text,
      });
    }

    // Include list of orders that were checked so client can display which ones were processed
    const to_check = ordersToSync.map(o => ({ id: o.id, waybillId: o.jt_waybill_id, currentStatus: o.status }));
    return res.status(200).json({ synced: syncResults.filter(r => r.success && r.updated).length, total: orders.length, to_check, results: syncResults });
  } catch (error) {
    console.error('JT sync error', error);
    return res.status(500).json({ error: 'JT sync failed', message: error.message });
  }
}
