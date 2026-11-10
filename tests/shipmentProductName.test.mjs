import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatShipmentProductName } from '../shipment-product-name.mjs';

test('single order: full name, visible display_id, SKU, size, color, quantity', () => {
  const text = formatShipmentProductName({
    id: 'uuid-internal-do-not-display', display_id: 17085,
    items: [{
      product_name: 'Túi 3CE Brown Travel Bag',
      sku: '3CE-BROWN-01',
      quantity: 2,
      variation_info: { fields: [
        { name: 'Màu', value: 'Nâu' },
        { name: 'Size', value: 'M' }
      ] }
    }]
  });
  assert.equal(text, 'Mã đơn #17085 - Túi 3CE Brown Travel Bag (Mã SP: 3CE-BROWN-01; Size: M; Màu: Nâu) x2');
  assert.doesNotMatch(text, /uuid-internal/);
});

test('multi-item order keeps all products and quantities', () => {
  const result = formatShipmentProductName({
    display_id: '17086', items: [
      { product_name: 'Giày Puma', quantity: 1, variation_name: 'Đen 37.5', sku: '399438-01' },
      { product_name: 'Túi 3CE Brown Travel Bag', quantity: 3 }
    ]
  });
  assert.match(result, /^Mã đơn #17086 - /);
  assert.match(result, /Giày Puma \(Đen 37\.5; Mã SP: 399438-01\) x1/);
  assert.match(result, /Túi 3CE Brown Travel Bag x3/);
});

test('grouped shipment retains every order display code and item ownership', () => {
  const result = formatShipmentProductName({
    id: 'root', items: [
      { product_name: 'Áo', quantity: 1, _shipment_order: '17087' },
      { product_name: 'Quần', quantity: 1, _shipment_order: '17088' }
    ]
  }, ['17087','17088']);
  assert.equal(result, 'Mã đơn #17087, #17088 - [#17087] Áo x1 | [#17088] Quần x1');
});

test('missing items uses order ID fallback but never fabricates a product', () => {
  assert.equal(formatShipmentProductName({ id: 'local_17089', items: [] }), 'Mã đơn #local_17089 - Hàng hóa');
});

test('does not duplicate variants already included in product name', () => {
  const result = formatShipmentProductName({
    display_id: '17090',
    items: [{ product_name: 'Giày Adidas Samba Đen 38 - IE1377', quantity: 1,
      sku: 'IE1377', size: '38', color: 'Đen' }]
  });
  assert.equal(result, 'Mã đơn #17090 - Giày Adidas Samba Đen 38 - IE1377 x1');
});

test('GomShip form uses the same full product-name field, and UI displays long text', () => {
  const form = readFileSync(new URL('../gomship-integration.mjs', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(form, /name: byId\('jtGoodsName'\)\?\.value\?\.trim\(\)/);
  assert.match(app, /formatShipmentProductName\(order, activeShipmentBundle\.labels\)/);
  assert.match(html, /<textarea id="jtGoodsName" required rows="3"/);
});
