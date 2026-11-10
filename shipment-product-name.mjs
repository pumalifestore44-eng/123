// Format all order items and the human-facing Pumalife order number for shipping.
const text = value => typeof value === 'string' || typeof value === 'number'
  ? String(value).trim() : '';
const filled = (...values) => values.map(text).find(Boolean) || '';
const sameInName = (name, value) => name.toLocaleLowerCase('vi').includes(value.toLocaleLowerCase('vi'));
const includesWholeValue = (name, value) => {
  const escaped = [...value].map(char => '^$.*+?()[]{}|\\'.includes(char) ? '\\' + char : char).join('');
  return new RegExp('(^|[^\\p{L}\\p{N}])' + escaped + '(?=$|[^\\p{L}\\p{N}])', 'iu').test(name);
};

function fieldValue(fields, matcher) {
  for (const field of fields || []) {
    if (!field || typeof field !== 'object') continue;
    if (!matcher.test(filled(field.name, field.label))) continue;
    const value = filled(field.value, field.option, field.text);
    if (value) return value;
  }
  return '';
}

export function formatShipmentProductName(order, labels = []) {
  const codes = [...new Set((labels.length ? labels : [order?.display_id || order?.id])
    .map(text).filter(Boolean))];
  const heading = codes.length ? 'Mã đơn ' + codes.map(code => '#' + code).join(', ') : 'Đơn hàng';
  const items = Array.isArray(order?.items) ? order.items : [];
  const names = items.map(item => {
    const variation = item?.variation_info && typeof item.variation_info === 'object'
      ? item.variation_info : {};
    const fields = Array.isArray(variation.fields) ? variation.fields : [];
    const name = filled(item?.product_name, item?.name, variation.name, 'Sản phẩm');
    const variantName = filled(item?.variation_name, variation.variation_name);
    const sku = filled(item?.sku, variation.sku, item?.product_code);
    const size = filled(item?.size, variation.size, fieldValue(fields, /size|kích\s*thước/i));
    const color = filled(item?.color, variation.color, fieldValue(fields, /màu|color/i));
    const extras = [];
    if (variantName && !sameInName(name, variantName)) extras.push(variantName);
    if (sku && !sameInName(name, sku)) extras.push('Mã SP: ' + sku);
    if (size && !includesWholeValue(name, size) && !extras.some(x => includesWholeValue(x, size))) extras.push('Size: ' + size);
    if (color && !sameInName(name, color) && !extras.some(x => sameInName(x, color))) extras.push('Màu: ' + color);
    const qty = Number(item?.quantity);
    const count = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const itemCode = codes.length > 1 && text(item?._shipment_order) ? '[#' + text(item._shipment_order) + '] ' : '';
    return itemCode + name + (extras.length ? ' (' + extras.join('; ') + ')' : '') + ' x' + count;
  });
  return heading + ' - ' + (names.length ? names.join(' | ') : 'Hàng hóa');
}