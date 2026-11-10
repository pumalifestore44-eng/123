import { primarySupabase } from './supabase-config.mjs';
import { clearGomshipOrderCapability } from './gomship-label-client.mjs';

const validId = value => /^[A-Za-z0-9_-]{1,80}$/.test(String(value || '')) ? String(value) : '';

async function callGomship(payload) {
  const response = await fetch(primarySupabase.url + '/functions/v1/gomship-create-order', {
    method: 'POST',
    headers: {
      apikey: primarySupabase.anonKey,
      Authorization: 'Bearer ' + primarySupabase.anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success)
    throw new Error('HTTP ' + response.status + ': ' +
      String(result?.error || 'Không thể kiểm tra/hủy vận đơn GomShip'));
  return result;
}

// Always query the server's carrier linkage, never guess by SPX tracking-code prefix.
export async function getShipmentCancelSource(localOrderId) {
  const orderId = validId(localOrderId);
  if (!orderId) throw new Error('Mã đơn Pumalife không hợp lệ');
  return callGomship({ action: 'get_cancel_source', order_id: orderId });
}

// Cancellation no longer depends on the browser's localStorage label token.
// The backend validates the exact Pumalife order + live SPX waybill and resolves
// GomShip's numeric order ID from its own shipment record.
export async function cancelGomshipShipment(localOrderId, currentWaybill) {
  const orderId = validId(localOrderId);
  const waybillId = String(currentWaybill || '').trim().toUpperCase();
  if (!orderId || !/^SPXVN[A-Z0-9]+$/.test(waybillId)) {
    throw new Error('Thiếu mã đơn Pumalife hoặc mã vận đơn SPX hợp lệ.');
  }
  const result = await callGomship({
    action: 'cancel_order',
    order_id: orderId,
    waybill_id: waybillId
  });
  if (result.cancelled || result.already_cancelled) {
    clearGomshipOrderCapability(orderId);
    if (result.order_id && result.order_id !== orderId)
      clearGomshipOrderCapability(result.order_id);
  }
  return result;
}