import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEditedOrderItems, planEditedOrderItems, saveEditedOrderSafely } from '../order-item-sync.mjs';

const newInput = (overrides = {}) => ({
  order_item_id: null, product_id: 'product-1', variation_id: 'variation-1',
  name: 'Giày Adidas - size 38', price: 1200000, quantity: 2,
  discount: 100000, item_note: 'Đóng kỹ', image_url: 'https://example.test/shoe.jpg',
  ...overrides
});
const dbRow = (id, overrides = {}) => ({
  id, order_id: 'order-abc', product_id: 'product-1', variation_id: 'variation-1',
  product_name: 'Giày Adidas - size 38', retail_price: 1000000,
  quantity: 1, discount_each_product: 0, item_note: '',
  variation_info: { name: 'Giày Adidas - size 38', fields: [{ name: 'size', value: '38' }] },
  ...overrides
});
const patch = {
  bill_full_name: 'Khách', bill_phone_number: '0900000000',
  shipping_fee: 25000, surcharge: 0, prepaid: 100000,
  total_price: 2325000, cod: 2225000, note: 'Hẹn sáng',
  shipping_address: { full_name: 'Khách', phone_number: '0900000000', full_address: 'Địa chỉ', address: 'Địa chỉ' }
};
const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'public-test-key',
  orderId: 'order-abc',
  patch
};
const respond = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(data)
});
function fakeApi({ initial = [], failInsert = false, failDelete = false, rpc = false } = {}) {
  let records = structuredClone(initial);
  let order = structuredClone(patch);
  const operations = [];
  return {
    get rows() { return records; },
    get order() { return order; },
    operations,
    async fetcher(rawUrl, { method, body }) {
      const url = new URL(rawUrl);
      const path = url.pathname.slice('/rest/v1/'.length);
      const payload = body ? JSON.parse(body) : undefined;
      operations.push({ method, path });
      if (path === 'rpc/pumalife_save_order_edits') {
        return rpc
          ? respond(200, { item_ids: [99], order_id: 'order-abc' })
          : respond(404, { code: 'PGRST202', message: 'Could not find function in schema cache' });
      }
      if (path === 'pancake_order_items' && method === 'POST') {
        if (failInsert) return respond(409, {
          code: '23505', message: 'duplicate key value violates unique constraint "pancake_order_items_pkey"'
        });
        const created = payload.map((r, i) => ({ ...r, id: 100 + i }));
        records.push(...created);
        return respond(201, created);
      }
      if (path === 'pancake_order_items' && method === 'GET') {
        const cols = url.searchParams.get('select');
        const current = cols === 'id,order_id'
          ? records.map(r => ({ id: r.id, order_id: r.order_id })) : structuredClone(records);
        return respond(200, current);
      }
      if (path === 'pancake_order_items' && method === 'PATCH') {
        const id = Number(url.searchParams.get('id').replace('eq.', ''));
        const row = records.find(r => r.id === id);
        if (!row) return respond(200, []);
        Object.assign(row, payload);
        return respond(200, [structuredClone(row)]);
      }
      if (path === 'pancake_order_items' && method === 'DELETE') {
        if (failDelete) return respond(500, { message: 'cannot delete' });
        const id = Number(url.searchParams.get('id').replace('eq.', ''));
        const current = records.filter(r => r.id === id);
        records = records.filter(r => r.id !== id);
        return respond(200, current);
      }
      if (path === 'pancake_orders' && method === 'PATCH') {
        order = { ...order, ...payload };
        return respond(200, [{ id: 'order-abc', ...order }]);
      }
      throw new Error('Unexpected endpoint: ' + method + ' ' + url.pathname);
    }
  };
}

test('input mapping preserves variation, notes and images; no client-supplied PK for new item', () => {
  const mapped = buildEditedOrderItems('order-abc', [newInput()])[0];
  assert.equal(mapped.id, undefined);
  assert.equal(mapped.variation_id, 'variation-1');
  assert.equal(mapped.product_id, 'product-1');
  assert.equal(mapped.variation_info.images[0], 'https://example.test/shoe.jpg');
  assert.equal(mapped.retail_price, 1200000);
  assert.equal(mapped.quantity, 2);
  assert.equal(mapped.discount_each_product, 100000);
  assert.equal(mapped.item_note, 'Đóng kỹ');
});

test('reconcile preserves distinct existing order item primary keys', () => {
  const original = [dbRow(15), dbRow(16), dbRow(17)];
  const desired = buildEditedOrderItems('order-abc', [
    newInput({ order_item_id: '15' }),
    newInput({ order_item_id: '17', quantity: 3 }),
    newInput({ name: 'Sản phẩm mới', order_item_id: null })
  ]);
  const plan = planEditedOrderItems(original, desired);
  assert.deepEqual(plan.update.map(x => x.row.id), [15, 17]);
  assert.deepEqual(plan.remove.map(x => x.id), [16]);
  assert.equal(plan.create.length, 1);
  assert.throws(() => planEditedOrderItems(original, [
    { ...desired[0] }, { ...desired[0] }
  ]), /lặp ID/);
  assert.throws(() => planEditedOrderItems(original, [
    { ...desired[0], id: 999 }
  ]), /thay đổi ở nơi khác/);
});

test('re-save unchanged order items PATCHes same IDs, never DELETE/POST', async () => {
  const fake = fakeApi({ initial: [dbRow(42), dbRow(43)] });
  const result = await saveEditedOrderSafely({
    ...config, fetcher: fake.fetcher,
    items: [
      newInput({ order_item_id: 42, price: 1120000, quantity: 2 }),
      newInput({ order_item_id: 43, name: 'Giày Adidas - size 39', quantity: 1 })
    ]
  });
  assert.deepEqual(result.itemIds, [42, 43]);
  assert.equal(result.atomic, false);
  assert.deepEqual(fake.rows.map(r => r.id), [42, 43]);
  assert.equal(fake.rows[0].quantity, 2);
  assert.equal(fake.rows[1].product_name, 'Giày Adidas - size 39');
  assert.equal(fake.rows[0].variation_info.fields[0].value, '38', 'Original size metadata must be retained');
  assert.equal(fake.operations.filter(x => x.method === 'POST' && x.path === 'pancake_order_items').length, 0);
  assert.equal(fake.operations.filter(x => x.method === 'DELETE').length, 0);
});

test('23505 during insertion keeps original products and the order unchanged', async () => {
  const original = [dbRow(55)];
  const fake = fakeApi({ initial: original, failInsert: true });
  await assert.rejects(() => saveEditedOrderSafely({
    ...config, fetcher: fake.fetcher,
    items: [newInput({ order_item_id: 55 }), newInput({ name: 'Đôi mới' })]
  }), /Bộ đếm ID/);
  assert.deepEqual(fake.rows, original, 'Existing item must not be touched');
  assert.deepEqual(fake.order, patch);
  assert.equal(fake.operations.filter(x => x.method === 'PATCH').length, 0);
  assert.equal(fake.operations.filter(x => x.method === 'DELETE').length, 0);
});

test('after sequence repair, new row inserts once and retains assigned ID', async () => {
  const fake = fakeApi({ initial: [dbRow(55)] });
  const result = await saveEditedOrderSafely({
    ...config, fetcher: fake.fetcher,
    items: [newInput({ order_item_id: 55 }), newInput({ name: 'Đôi mới' })]
  });
  assert.deepEqual(result.itemIds, [55, 100]);
  assert.deepEqual(fake.rows.map(r => r.id), [55, 100]);
  const saveAgain = await saveEditedOrderSafely({
    ...config, fetcher: fake.fetcher,
    items: [newInput({ order_item_id: 55 }), newInput({ order_item_id: 100, name: 'Đôi mới' })]
  });
  assert.deepEqual(saveAgain.itemIds, [55, 100]);
  assert.equal(fake.operations.filter(x => x.method === 'POST' && x.path === 'pancake_order_items').length, 1);
});

test('delete failure is checked rather than silently ignored', async () => {
  const fake = fakeApi({ initial: [dbRow(11), dbRow(12)], failDelete: true });
  await assert.rejects(() => saveEditedOrderSafely({
    ...config, fetcher: fake.fetcher,
    items: [newInput({ order_item_id: 11 })]
  }), /cannot delete/);
  assert.equal(fake.rows.length, 2, 'Delete error preserves original rows');
  assert.equal(fake.operations.filter(x => x.method === 'PATCH' && x.path === 'pancake_orders').length, 0);
});

test('transactional RPC sends one request and does not fallback on successful response', async () => {
  const fake = fakeApi({ rpc: true });
  const result = await saveEditedOrderSafely({
    ...config, fetcher: fake.fetcher,
    items: [newInput()]
  });
  assert.deepEqual(result.itemIds, [99]);
  assert.equal(result.atomic, true);
  assert.deepEqual(fake.operations.map(x => x.path), ['rpc/pumalife_save_order_edits']);
});

test('both UI save handlers use the shared safe reconciler', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ saveEditedOrderSafely \} from '\.\/order-item-sync\.mjs'/);
  assert.equal((app.match(/await saveEditedOrderSafely\(/g) || []).length, 2);
  const first = app.slice(app.indexOf('window.saveOrderEdits = async'), app.indexOf('MODAL-BASED QUICK ORDER EDIT'));
  assert.doesNotMatch(first, /method: 'DELETE'|pancake_order_items\?order_id=eq/);
  assert.match(app, /data-order-item-id/);
  assert.match(app, /_savingOrderIds\.has/);
});
