import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { getShipmentCancelSource, cancelGomshipShipment } from '../gomship-cancel-client.mjs';

test('Cancellation no longer needs label token or same-browser Local Storage', async () => {
  const requests = [];
  // No localStorage on purpose: cancellation must not depend on this browser.
  delete globalThis.localStorage;
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const result = requests.at(-1).action === 'get_cancel_source'
      ? { success: true, source: 'gomship', status: 'created' }
      : { success: true, cancelled: true, source: 'gomship' };
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const source = await getShipmentCancelSource('ORDER-456');
  assert.equal(source.source, 'gomship');
  const response = await cancelGomshipShipment('ORDER-456', 'SPXVN123456');
  assert.equal(response.cancelled, true);
  assert.deepEqual(requests.map(x => x.action), ['get_cancel_source', 'cancel_order']);
  assert.equal(requests[1].waybill_id, 'SPXVN123456');
  assert.equal(requests[1].order_id, 'ORDER-456');
  assert.equal(requests[1].label_token, undefined);
  assert.equal(requests[1].gomship_order_id, undefined);
});

test('Invalid waybill stops cancellation before contacting the server', async () => {
  let count = 0;
  globalThis.fetch = async () => { count++; return new Response('{}'); };
  await assert.rejects(() => cancelGomshipShipment('ORDER-OTHER', ''), /Thiếu mã đơn/);
  assert.equal(count, 0);
});

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const from = app.indexOf('window.cancelSpxOrder = window.cancelJtOrder = async function(');
const to = app.indexOf('// Function to copy bill.html invoice link', from);
assert.ok(from >= 0 && to > from, 'Cancel dispatcher is available');
const dispatcher = app.slice(from, to);

function simulateCancel({source = 'gomship', failure = null, allow = true} = {}) {
  const alerts = [], network = [], carrier = [];
  const btn = { disabled: false, innerHTML: 'Hủy', textContent: '' };
  const ctx = {
    window: {},
    console,
    activeThread: null,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_KEY: 'anon-mock',
    getShipmentCancelSource: async () => {
      if (failure) throw new Error(failure);
      return { success: true, source };
    },
    cancelGomshipShipment: async (id, waybill) => { carrier.push([id,waybill]); return { success: true, cancelled: true }; },
    fetchDashboardOrders: async () => {},
    confirm: () => allow,
    alert: msg => alerts.push(msg),
    fetch: async (url, init) => {
      network.push({ url, init });
      if (String(url).includes('/functions/v1/create-order'))
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      return new Response('{}', { status: 200 });
    }
  };
  runInNewContext(dispatcher, ctx);
  const event = { stopPropagation() {}, target: { closest: () => btn } };
  return {
    ctx, alerts, carrier, network, btn,
    run: () => ctx.window.cancelSpxOrder('ORDER-456', 'SPXVN123456', event)
  };
}

test('GomShip cancellation is dispatched without ever calling direct SPX', async () => {
  const ctx = simulateCancel();
  await ctx.run();
  assert.deepEqual(ctx.carrier, [['ORDER-456','SPXVN123456']]);
  assert.equal(ctx.network.length, 0);
  assert.match(ctx.alerts[0], /GomShip/);
  assert.equal(ctx.btn.disabled, false);
});

test('SPX-direct cancellation continues to use existing create-order API', async () => {
  const ctx = simulateCancel({ source: 'spx' });
  await ctx.run();
  assert.equal(ctx.carrier.length, 0);
  assert.equal(ctx.network[0].url, 'https://example.supabase.co/functions/v1/create-order');
  assert.equal(JSON.parse(ctx.network[0].init.body).action, 'cancel');
  assert.equal(ctx.network[1].init.method, 'PATCH');
});

test('Failed carrier lookup blocks cancellation instead of guessing SPX', async () => {
  const ctx = simulateCancel({ failure: 'Function not deployed' });
  await ctx.run();
  assert.equal(ctx.carrier.length, 0);
  assert.equal(ctx.network.length, 0);
  assert.match(ctx.alerts[0], /chưa gửi yêu cầu hủy/);
});

test('No confirmation means no cancellation on either service', async () => {
  const ctx = simulateCancel({ source: 'gomship', allow: false });
  await ctx.run();
  assert.equal(ctx.carrier.length, 0);
  assert.equal(ctx.network.length, 0);
});

test('Server cancel verifies order and live waybill before DELETE /orders/{stored numeric ID}', () => {
  const fn = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/gomship_setup.sql', import.meta.url), 'utf8');
  assert.match(fn, /if \(input\.action === "get_cancel_source"\)/);
  assert.match(fn, /if \(input\.action === "cancel_order"\)/);
  assert.match(fn, /result = await gomship\("\/orders\/" \+ id, token, "DELETE"\)/);
  assert.match(fn, /suppliedWaybill !== originalCode\.toUpperCase\(\)/);
  assert.match(fn, /const carrierId = ship\.gomship_order_id \?\? gomshipOrderId\(ship\.response\)/);
  assert.match(fn, /\.eq\("status", "created"\)/);
  assert.match(fn, /const id = Number\(carrierId\)/);
  assert.match(fn, /if \(!result\.ok\)/);
  assert.match(fn, /syncCancelledPumalife\(orderId, originalCode\)/);
  assert.match(fn, /status: "cancel_sync_failed"/);
  assert.match(sql, /add column if not exists cancel_response jsonb/);
});