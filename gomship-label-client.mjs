import { primarySupabase } from './supabase-config.mjs';
import { getPumalifeAccessToken } from './pumalife-session.mjs';

// A per-order capability is issued by the Edge Function after GomShip creates a shipment.
// The backend stores only the SHA-256 hash; no arbitrary GomShip ID is accepted from the browser.
const PREFIX = 'pumalife:gomship:label:v1:';
const volatile = new Map();
const validId = v => /^[A-Za-z0-9_-]{1,80}$/.test(String(v || '')) ? String(v) : '';

export function rememberLabelAccess(orderId, response) {
  const id = validId(orderId);
  const item = response?.label_access;
  const token = String(item?.token || '');
  const gid = Number(item?.gomship_order_id);
  if (!id || !/^[0-9a-f]{64}$/.test(token) || !Number.isSafeInteger(gid) || gid <= 0)
    return false;
  const entry = { token, gomship_order_id: gid };
  volatile.set(id, entry);
  try { localStorage.setItem(PREFIX + id, JSON.stringify(entry)); } catch {}
  return true;
}

function getGrant(id) {
  id = validId(id);
  if (!id) return null;
  if (volatile.has(id)) return volatile.get(id);
  try {
    const entry = JSON.parse(localStorage.getItem(PREFIX + id) || 'null');
    if (entry && /^[0-9a-f]{64}$/.test(entry.token) &&
        Number.isSafeInteger(Number(entry.gomship_order_id))) return entry;
  } catch {}
  return null;
}

export function hasGomshipLabelAccess(orderId) {
  return Boolean(getGrant(orderId));
}

/** Used for the same order's authorized carrier actions; do not display or log. */
export function getGomshipOrderCapability(orderId) {
  const grant = getGrant(orderId);
  return grant?.token || '';
}

export function clearGomshipOrderCapability(orderId) {
  const id = validId(orderId);
  if (!id) return;
  volatile.delete(id);
  try { localStorage.removeItem(PREFIX + id); } catch {}
}

export async function isGomshipShipmentByOrder(orderId) {
  const id = validId(orderId);
  if (!id) return false;
  const response = await fetch(primarySupabase.url + '/functions/v1/gomship-create-order', {
    method: 'POST',
    headers: { 'Content-Type':'application/json',apikey:primarySupabase.anonKey,
      Authorization:'Bearer '+primarySupabase.anonKey },
    body: JSON.stringify({ action:'get_cancel_source',order_id:id }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) return false;
  const result = await response.json().catch(()=>null);
  return result?.success === true && result?.source === 'gomship' &&
    result?.status === 'created';
}

export async function fetchLabelPdf(orderId) {
  const id = validId(orderId);
  if (!id) throw new Error('Mã đơn hàng không hợp lệ');
  // Reuse the main Pumalife Auth session. No print-only login or password.
  const appToken = await getPumalifeAccessToken().catch(() => null);
  const grant = getGrant(id);
  if (!appToken && !grant)
    throw new Error('Phiên Pumalife hết hạn. Vui lòng đăng nhập lại ở màn hình chính.');
  const response = await fetch(primarySupabase.url + '/functions/v1/gomship-create-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: primarySupabase.anonKey,
      Authorization: 'Bearer ' + (appToken || primarySupabase.anonKey)
    },
    body: JSON.stringify(appToken
      ? { action: 'get_label_by_order', order_id: id }
      : { action: 'get_label', order_id: id, label_token: grant.token }),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error('HTTP ' + response.status + ': ' + (body?.error || 'Không lấy được nhãn PDF'));
  }
  if (!/application\/pdf/i.test(response.headers.get('content-type') || ''))
    throw new Error('GomShip không trả về PDF');
  const blob = await response.blob();
  if (blob.size < 5 || blob.size > 12 * 1024 * 1024)
    throw new Error('File nhãn PDF không hợp lệ');
  return blob;
}