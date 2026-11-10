// Update one visible "Đơn hàng gần đây" card after a successful order save.
// The full message history is deliberately untouched.
export async function refreshRenderedRecentOrder({
  orderId, orders, container, fetchOrder, renderCard, onRendered = () => {}
}) {
  if (!orderId || !Array.isArray(orders) || !container) return false;
  const index = orders.findIndex(order => String(order.id) === String(orderId));
  if (index < 0) return false;
  const card = container.querySelector(
    '.order-history-card[data-recent-order-index="' + index + '"]'
  );
  if (!card) return false;
  const updated = await fetchOrder(String(orderId));
  if (!updated || String(updated.id) !== String(orderId))
    throw new Error('Không tải được dữ liệu đơn vừa lưu');
  // The customer may have switched conversations while the request was running.
  if (orders[index]?.id !== updated.id || !card.isConnected) return false;
  orders[index] = updated;
  card.outerHTML = renderCard(updated, index);
  onRendered();
  return true;
}
