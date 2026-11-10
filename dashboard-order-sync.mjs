// Refresh exactly one visible dashboard order after a successful edit.
// Keep the expanded panel, avoid a dashboard-wide reload, and reject stale responses.
export async function refreshRenderedDashboardOrder({
  orderId, container, fetchOrder, renderRows, onRendered
}) {
  if (!container) return false;
  const id = String(orderId);
  const findRow = selector => Array.from(container.querySelectorAll(selector))
    .find(row => String(row.dataset?.dashboardOrderId) === id);
  const oldSummary = findRow('.order-summary-row');
  const oldDetail = findRow('.order-edit-detail-row');
  if (!oldSummary || !oldDetail) return false;
  const wasOpen = oldDetail.classList.contains('order-edit-open');
  const fresh = await fetchOrder(id);
  if (!fresh || String(fresh.id) !== id)
    throw new Error('Dữ liệu đơn hàng vừa tải lại không trùng mã đơn đã lưu.');

  // The user may change page or search while the refresh request is running.
  if (findRow('.order-summary-row') !== oldSummary ||
      findRow('.order-edit-detail-row') !== oldDetail ||
      !oldSummary.isConnected || !oldDetail.isConnected) return false;
  const { summaryRow, detailRow } = renderRows(fresh) || {};
  if (!summaryRow || !detailRow)
    throw new Error('Không tạo được dòng đơn hàng mới từ dữ liệu đã lưu.');

  if (wasOpen) {
    detailRow.classList.add('order-edit-open');
    detailRow.style.display = 'table-row';
  }
  oldSummary.replaceWith(summaryRow);
  oldDetail.replaceWith(detailRow);
  if (onRendered) await onRendered(fresh, { summaryRow, detailRow, wasOpen });
  return true;
}

// Orders and order items are read separately to avoid PostgREST joins timing out.
// Never use locally edited values as the authoritative refreshed view.
export async function loadSavedDashboardOrder({
  orderId, supabaseUrl, supabaseKey, fetcher = fetch,
  decorateOrders = async orders => orders, logger = console
}) {
  const base = supabaseUrl.replace(/\/$/, '') + '/rest/v1/';
  const headers = { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey };
  const id = encodeURIComponent(String(orderId));
  const [orderRes, itemsRes] = await Promise.all([
    fetcher(base + 'pancake_orders?select=*&id=eq.' + id + '&limit=1',
      { headers, cache: 'no-store' }),
    fetcher(base + 'pancake_order_items?select=*&order_id=eq.' + id,
      { headers, cache: 'no-store' })
  ]);
  if (!orderRes.ok || !itemsRes.ok)
    throw new Error('Không đọc lại được đơn vừa lưu từ Supabase (HTTP ' +
      orderRes.status + '/' + itemsRes.status + ').');

  const orders = await orderRes.json();
  const items = await itemsRes.json();
  const order = orders?.[0];
  if (!order || String(order.id) !== String(orderId) || !Array.isArray(items))
    throw new Error('Dữ liệu đơn hàng sau khi lưu không hợp lệ.');

  const productIds = [...new Set(items.map(item => item.product_id).filter(Boolean))];
  let links = new Map();
  if (productIds.length) {
    try {
      const res = await fetcher(base + 'pancake_products?select=id,product_link&id=in.(' +
        productIds.map(value => encodeURIComponent(String(value))).join(',') + ')',
        { headers, cache: 'no-store' });
      if (res.ok) links = new Map((await res.json()).map(product =>
        [String(product.id), product.product_link || '']));
    } catch (error) {
      logger.warn('[Dashboard] Cannot refresh product links:', error);
    }
  }
  order.items = items.map(item => ({
    ...item, product_link: item.product_link || links.get(String(item.product_id)) || ''
  }));
  if (order.warehouse_id) {
    try {
      const res = await fetcher(base + 'warehouses?select=*&id=eq.' +
        encodeURIComponent(String(order.warehouse_id)) + '&limit=1',
        { headers, cache: 'no-store' });
      if (res.ok) order.warehouse = (await res.json())?.[0] || null;
    } catch (error) {
      logger.warn('[Dashboard] Cannot refresh warehouse:', error);
    }
  }
  const decorated = await decorateOrders([order]);
  return decorated?.[0] || order;
}
